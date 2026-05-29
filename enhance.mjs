#!/usr/bin/env node
/**
 * 실사 사진 AI 보정 스크립트
 * 사용법: node enhance.mjs "주제명"
 * images/ 폴더의 cut_XX.png 를 Vertex AI Imagen으로 보정 후 덮어씁니다.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { loadEnv, ROOT, slugify, httpsReq, sleep } from "./steps/utils.mjs";

loadEnv();

const topic = process.argv[2];
if (!topic) {
  console.error('사용법: node enhance.mjs "주제명"');
  console.error('예시:   node enhance.mjs "안동 하회마을"');
  process.exit(1);
}

const LOCATION   = "us-central1";
const EDIT_MODEL = "imagen-3.0-capability-001";
const API_HOST   = `${LOCATION}-aiplatform.googleapis.com`;
const RETRY_DELAYS = [30_000, 60_000, 60_000];

const slug      = slugify(topic);
const imagesDir = join(ROOT, "output", slug, "images");
const scenarioPath = join(ROOT, "output", slug, "scenario.json");

if (!existsSync(scenarioPath)) {
  console.error(`시나리오 없음: ${scenarioPath}`);
  process.exit(1);
}

const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8"));

async function getGoogleToken() {
  const saKeyPath = process.env.GOOGLE_SA_KEY_PATH;
  if (!saKeyPath || !existsSync(saKeyPath))
    throw new Error(`Google SA 키 파일 없음: ${saKeyPath}`);
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    keyFile: saKeyPath,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function enhanceImage(imgPath, prompt, token, projectId) {
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
      console.log(`  429 쿼터 → ${wait / 1000}초 후 재시도...`);
      await sleep(wait);
      continue;
    }
    if (res.status !== 200) {
      console.log(`  API 오류 ${res.status} — 원본 유지`);
      return null;
    }

    const b64out = res.body?.predictions?.[0]?.bytesBase64Encoded;
    return b64out ? Buffer.from(b64out, "base64") : null;
  }
  return null;
}

async function main() {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  if (!projectId) throw new Error("GOOGLE_PROJECT_ID가 .env에 없습니다.");

  console.log(`\nAI 보정 시작: "${topic}"`);
  console.log(`이미지 폴더: ${imagesDir}\n`);

  const token = await getGoogleToken();
  const cuts  = scenario.cuts || [];

  for (let i = 0; i < cuts.length; i++) {
    const cut    = cuts[i];
    const padded = String(cut.cut_number).padStart(2, "0");
    const imgPath = join(imagesDir, `cut_${padded}.png`);

    if (!existsSync(imgPath)) {
      console.log(`  cut_${padded}: 파일 없음 — 건너뜀`);
      continue;
    }

    // 원본 백업
    const backupPath = join(imagesDir, `cut_${padded}_original.png`);
    if (!existsSync(backupPath)) {
      copyFileSync(imgPath, backupPath);
    }

    const prompt =
      `Cinematic color grading, enhance lighting quality, professional photography, ` +
      `sharp details, rich warm tones, National Geographic aesthetic. ` +
      `Scene: ${cut.scene_description || cut.photo_search_query || topic}`;

    console.log(`  cut_${padded}: AI 보정 중...`);
    const enhanced = await enhanceImage(imgPath, prompt, token, projectId);

    if (enhanced) {
      writeFileSync(imgPath, enhanced);
      console.log(`  cut_${padded}: ✓ 보정 완료 (${Math.round(enhanced.length / 1024)} KB)`);
    } else {
      console.log(`  cut_${padded}: 보정 실패 — 원본 유지`);
    }

    if (i < cuts.length - 1) {
      console.log(`  다음 컷까지 20초 대기...`);
      await sleep(20_000);
    }
  }

  console.log("\n✓ AI 보정 완료!");
  console.log("원본은 cut_XX_original.png 로 백업되어 있습니다.");
  console.log("\n다음 단계:");
  console.log(`  node run.mjs "${topic}" --from overlay`);
}

main().catch(e => {
  console.error("\n오류:", e.message);
  process.exit(1);
});
