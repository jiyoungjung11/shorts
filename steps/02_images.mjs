import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { httpsReq, sleep } from "./utils.mjs";

const LOCATION = "us-central1";
const MODEL    = "imagen-3.0-generate-002";
const API_HOST = `${LOCATION}-aiplatform.googleapis.com`;

// 429 시 재시도 간격 (ms): 65s, 65s, 65s  (60s 쿼터 윈도우 + 여유)
const RETRY_DELAYS = [65_000, 65_000, 65_000];
// 정상 요청 사이 간격 — 5QPM 쿼터 기준 20s = 분당 3개 (안전 마진 확보)
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

async function generateOneImage(prompt, token, projectId) {
  const apiPath = `/v1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const res = await httpsReq(
      "POST",
      `https://${API_HOST}${apiPath}`,
      {
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: "1:1", outputOptions: { mimeType: "image/png" } },
      },
      { Authorization: `Bearer ${token}` }
    );

    if (res.status === 429) {
      if (attempt === RETRY_DELAYS.length) {
        throw new Error(`Imagen API 쿼터 초과 — 재시도 ${RETRY_DELAYS.length}회 모두 실패`);
      }
      const wait = RETRY_DELAYS[attempt];
      console.log(`  429 쿼터 초과 → ${wait / 1000}초 후 재시도 (${attempt + 1}/${RETRY_DELAYS.length})...`);
      await sleep(wait);
      continue;
    }

    if (res.status !== 200) {
      throw new Error(`Imagen API error ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
    }

    const b64 = res.body?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error("이미지 데이터 없음");
    return Buffer.from(b64, "base64");
  }
}

export async function generateImages(scenario, imagesDir) {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  if (!projectId) throw new Error("GOOGLE_PROJECT_ID가 .env에 없습니다.");

  const token = await getGoogleToken();
  const cuts = scenario.cuts || [];

  for (let i = 0; i < cuts.length; i++) {
    const cut    = cuts[i];
    const num    = cut.cut_number;
    const padded = String(num).padStart(2, "0");
    const outPath = join(imagesDir, `cut_${padded}.png`);

    if (existsSync(outPath)) {
      console.log(`  cut_${padded}: 이미 존재, 건너뜀`);
      continue;
    }

    console.log(`  cut_${padded}/${cuts.length} 생성 중...`);
    const imgBuf = await generateOneImage(cut.image_prompt, token, projectId);
    writeFileSync(outPath, imgBuf);
    const kb = Math.round(imgBuf.length / 1024);
    console.log(`  cut_${padded} 저장 (${kb} KB)`);

    // 마지막 컷이 아니면 다음 요청 전에 대기
    if (i < cuts.length - 1) {
      console.log(`  다음 요청까지 ${REQUEST_INTERVAL_MS / 1000}초 대기...`);
      await sleep(REQUEST_INTERVAL_MS);
    }
  }
}
