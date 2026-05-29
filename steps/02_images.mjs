import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { httpsReq, downloadFile, sleep } from "./utils.mjs";

const LOCATION    = "us-central1";
const EDIT_MODEL  = "imagen-3.0-capability-001";
const API_HOST    = `${LOCATION}-aiplatform.googleapis.com`;

// Retry delays for 429 quota errors
const RETRY_DELAYS = [30_000, 60_000, 60_000];

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

// Wikimedia Commons photo search — no API key required
async function searchWikimediaPhoto(query) {
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
      // Skip very small images (< 200px in any dimension)
      if ((info.width && info.width < 200) || (info.height && info.height < 200)) continue;
      return info.url;
    }
  }
  return null;
}

// Resize any photo to 1080×1920 portrait using blur-pad (preserves original aspect ratio)
function resizeToPortrait(srcPath, destPath) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  // blur-pad: centered image on a blurred version of itself
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
    // fallback: simple center-crop
    const simple = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";
    execSync(`"${ffmpeg}" -y -i "${srcPath}" -vf "${simple}" "${destPath}"`);
  }
}

// AI beautification via Vertex AI Imagen editing
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

    if (res.status !== 200) {
      console.log(`    AI 보정 응답 ${res.status} — 원본 사용`);
      return null;
    }

    const b64out = res.body?.predictions?.[0]?.bytesBase64Encoded;
    return b64out ? Buffer.from(b64out, "base64") : null;
  }
  return null;
}

export async function generateImages(scenario, imagesDir) {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  if (!projectId) throw new Error("GOOGLE_PROJECT_ID가 .env에 없습니다.");

  const token  = await getGoogleToken();
  const cuts   = scenario.cuts || [];
  const tmp    = tmpdir();

  for (let i = 0; i < cuts.length; i++) {
    const cut    = cuts[i];
    const padded = String(cut.cut_number).padStart(2, "0");
    const outPath = join(imagesDir, `cut_${padded}.png`);

    if (existsSync(outPath)) {
      console.log(`  cut_${padded}: 이미 존재, 건너뜀`);
      continue;
    }

    // ── 1. 실사 사진 검색 ───────────────────────────────────
    const searchQuery = cut.photo_search_query || cut.scene_description || scenario.topic;
    console.log(`  cut_${padded}: 검색 중 — "${searchQuery}"`);

    const photoUrl = await searchWikimediaPhoto(searchQuery);
    if (!photoUrl) {
      console.log(`  cut_${padded}: 사진을 찾지 못했습니다 — 건너뜀`);
      continue;
    }

    // ── 2. 다운로드 ─────────────────────────────────────────
    const ext      = (photoUrl.split(".").pop().split("?")[0] || "jpg").toLowerCase();
    const tmpOrig  = join(tmp, `shorts_${padded}_orig.${ext}`);
    const tmpSized = join(tmp, `shorts_${padded}_sized.png`);

    console.log(`  cut_${padded}: 다운로드 중...`);
    await downloadFile(photoUrl, tmpOrig);

    // ── 3. 1080×1920 리사이즈 ────────────────────────────────
    console.log(`  cut_${padded}: 1080×1920 변환 중...`);
    resizeToPortrait(tmpOrig, tmpSized);

    // ── 4. AI 보정 ──────────────────────────────────────────
    console.log(`  cut_${padded}: AI 보정 중 (Imagen)...`);
    const enhancePrompt =
      `Cinematic color grading, enhance lighting quality, professional photography look, ` +
      `sharp details, warm tones. Scene: ${cut.scene_description || searchQuery}`;

    const enhanced = await enhanceWithAI(tmpSized, enhancePrompt, token, projectId);

    if (enhanced) {
      writeFileSync(outPath, enhanced);
      console.log(`  cut_${padded}: AI 보정 완료 (${Math.round(enhanced.length / 1024)} KB)`);
    } else {
      writeFileSync(outPath, readFileSync(tmpSized));
      console.log(`  cut_${padded}: 실사 사진 저장 (AI 보정 미적용)`);
    }

    // ── 5. 임시 파일 정리 ────────────────────────────────────
    try { unlinkSync(tmpOrig);  } catch (_) {}
    try { unlinkSync(tmpSized); } catch (_) {}

    if (i < cuts.length - 1) await sleep(3_000);
  }
}
