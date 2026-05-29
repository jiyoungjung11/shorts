import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { httpsReq, downloadFile, sleep } from "./utils.mjs";

const LOCATION    = "us-central1";
const EDIT_MODEL  = "imagen-3.0-capability-001";
const GEN_MODEL   = "imagen-3.0-generate-002";
const API_HOST    = `${LOCATION}-aiplatform.googleapis.com`;

// Retry delays for 429 quota errors
const RETRY_DELAYS      = [30_000, 60_000, 60_000];
const REQUEST_INTERVAL_MS = 20_000;

async function getGoogleToken() {
  const saKeyPath = process.env.GOOGLE_SA_KEY_PATH;
  if (!saKeyPath) throw new Error("GOOGLE_SA_KEY_PATH가 .env에 없습니다.");
  if (!existsSync(saKeyPath)) throw new Error(`서비스 계정 파일 없음: ${saKeyPath}`);
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    keyFile: saKeyPath,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

// ── Wikimedia Commons 실사 사진 검색 ───────────────────────────
async function searchWikimediaPhoto(query) {
  try {
    const q = encodeURIComponent(query);
    const searchRes = await httpsReq(
      "GET",
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${q}&srnamespace=6&format=json&srlimit=10`,
      null
    );
    const results = (searchRes.body?.query?.search || [])
      .filter(r => /\.(jpe?g|png|webp)/i.test(r.title));

    for (const result of results.slice(0, 5)) {
      const title = encodeURIComponent(result.title);
      const infoRes = await httpsReq(
        "GET",
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${title}&prop=imageinfo&iiprop=url|size&format=json`,
        null
      );
      const pages = infoRes.body?.query?.pages || {};
      const page  = Object.values(pages)[0];
      const info  = page?.imageinfo?.[0];
      if (info?.url) {
        if ((info.width && info.width < 200) || (info.height && info.height < 200)) continue;
        return info.url;
      }
    }
  } catch (_) {
    // 네트워크 차단 등 접근 불가 시 null 반환 → AI 생성 폴백
  }
  return null;
}

// ── 이미지 1080×1920 리사이즈 (blur-pad) ────────────────────────
function resizeToPortrait(srcPath, destPath) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const filter = [
    "split[a][b]",
    "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:8[bg]",
    "[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg]",
    "[bg][fg]overlay=(W-w)/2:(H-h)/2",
  ].join(";");
  try {
    execSync(`"${ffmpeg}" -y -i "${srcPath}" -vf "${filter}" -q:v 2 "${destPath}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (_) {
    const simple = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";
    execSync(`"${ffmpeg}" -y -i "${srcPath}" -vf "${simple}" "${destPath}"`);
  }
}

// ── Vertex AI Imagen 편집 (실사 사진 AI 보정) ────────────────────
async function enhanceWithAI(imgPath, prompt, token, projectId) {
  const b64 = readFileSync(imgPath).toString("base64");
  const apiPath = `/v1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/${EDIT_MODEL}:predict`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const res = await httpsReq(
      "POST",
      `https://${API_HOST}${apiPath}`,
      {
        instances: [{
          prompt,
          referenceImages: [{
            referenceType: "REFERENCE_TYPE_RAW",
            referenceId: 1,
            referenceImage: { bytesBase64Encoded: b64 },
          }],
        }],
        parameters: {
          editConfig: { editMode: "EDIT_MODE_DEFAULT" },
          aspectRatio: "9:16",
          sampleCount: 1,
        },
      },
      { Authorization: `Bearer ${token}` }
    );

    if (res.status === 429) {
      if (attempt === RETRY_DELAYS.length) return null;
      const wait = RETRY_DELAYS[attempt];
      console.log(`    429 쿼터 → ${wait / 1000}초 후 재시도...`);
      await sleep(wait);
      continue;
    }
    if (res.status !== 200) return null;

    const b64out = res.body?.predictions?.[0]?.bytesBase64Encoded;
    return b64out ? Buffer.from(b64out, "base64") : null;
  }
  return null;
}

// ── Vertex AI Imagen 생성 (실사 사진 없을 때 폴백) ───────────────
async function generateWithImagen(prompt, token, projectId) {
  const apiPath = `/v1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/${GEN_MODEL}:predict`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const res = await httpsReq(
      "POST",
      `https://${API_HOST}${apiPath}`,
      {
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: "9:16", outputOptions: { mimeType: "image/png" } },
      },
      { Authorization: `Bearer ${token}` }
    );

    if (res.status === 429) {
      if (attempt === RETRY_DELAYS.length) throw new Error("Imagen 쿼터 초과 — 재시도 모두 실패");
      const wait = RETRY_DELAYS[attempt];
      console.log(`    429 쿼터 → ${wait / 1000}초 후 재시도...`);
      await sleep(wait);
      continue;
    }
    if (res.status !== 200)
      throw new Error(`Imagen API error ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);

    const b64 = res.body?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error("이미지 데이터 없음");
    return Buffer.from(b64, "base64");
  }
}

// ── 메인 ─────────────────────────────────────────────────────────
export async function generateImages(scenario, imagesDir) {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  if (!projectId) throw new Error("GOOGLE_PROJECT_ID가 .env에 없습니다.");

  const token = await getGoogleToken();
  const cuts  = scenario.cuts || [];
  const tmp   = tmpdir();

  for (let i = 0; i < cuts.length; i++) {
    const cut    = cuts[i];
    const padded = String(cut.cut_number).padStart(2, "0");
    const outPath = join(imagesDir, `cut_${padded}.png`);

    if (existsSync(outPath)) {
      console.log(`  cut_${padded}: 이미 존재, 건너뜀`);
      continue;
    }

    const searchQuery = cut.photo_search_query || cut.scene_description || scenario.topic;

    // ── 1. 실사 사진 검색 ──────────────────────────────────────
    console.log(`  cut_${padded}: 실사 사진 검색 중 — "${searchQuery}"`);
    const photoUrl = await searchWikimediaPhoto(searchQuery);

    if (photoUrl) {
      // ── 2a. 실사 사진 다운로드 → 리사이즈 → AI 보정 ──────────
      const ext      = (photoUrl.split(".").pop().split("?")[0] || "jpg").toLowerCase();
      const tmpOrig  = join(tmp, `shorts_${padded}_orig.${ext}`);
      const tmpSized = join(tmp, `shorts_${padded}_sized.png`);

      console.log(`  cut_${padded}: 다운로드 중...`);
      await downloadFile(photoUrl, tmpOrig);

      console.log(`  cut_${padded}: 1080×1920 변환 중...`);
      resizeToPortrait(tmpOrig, tmpSized);

      console.log(`  cut_${padded}: AI 보정 중 (Imagen edit)...`);
      const enhancePrompt =
        `Cinematic color grading, enhance lighting quality, professional photography look, ` +
        `sharp details, warm tones. Scene: ${cut.scene_description || searchQuery}`;
      const enhanced = await enhanceWithAI(tmpSized, enhancePrompt, token, projectId);

      if (enhanced) {
        writeFileSync(outPath, enhanced);
        console.log(`  cut_${padded}: ✓ 실사+AI 보정 완료 (${Math.round(enhanced.length / 1024)} KB)`);
      } else {
        writeFileSync(outPath, readFileSync(tmpSized));
        console.log(`  cut_${padded}: ✓ 실사 사진 저장 (AI 보정 미적용)`);
      }

      try { unlinkSync(tmpOrig);  } catch (_) {}
      try { unlinkSync(tmpSized); } catch (_) {}

    } else {
      // ── 2b. 실사 사진 없음 → Vertex AI Imagen 생성 (폴백) ─────
      console.log(`  cut_${padded}: 실사 사진 없음 → AI 생성으로 대체 중...`);
      const imgBuf = await generateWithImagen(cut.image_prompt, token, projectId);
      writeFileSync(outPath, imgBuf);
      console.log(`  cut_${padded}: ✓ AI 생성 완료 (${Math.round(imgBuf.length / 1024)} KB)`);
    }

    if (i < cuts.length - 1) {
      console.log(`  다음 컷까지 ${REQUEST_INTERVAL_MS / 1000}초 대기...`);
      await sleep(REQUEST_INTERVAL_MS);
    }
  }
}
