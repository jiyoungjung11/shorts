import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { httpsReq } from "./utils.mjs";

const LOCATION = "us-central1";
const MODEL    = "imagen-3.0-generate-002";
const API_HOST = `${LOCATION}-aiplatform.googleapis.com`;

async function getGoogleToken() {
  const { GoogleAuth } = await import("google-auth-library");

  let authOpts;
  if (process.env.GOOGLE_SA_KEY_JSON) {
    authOpts = {
      credentials: JSON.parse(process.env.GOOGLE_SA_KEY_JSON),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    };
  } else {
    const saKeyPath = process.env.GOOGLE_SA_KEY_PATH;
    if (!saKeyPath) throw new Error("GOOGLE_SA_KEY_PATH 또는 GOOGLE_SA_KEY_JSON이 없습니다.");
    if (!existsSync(saKeyPath)) throw new Error(`서비스 계정 파일 없음: ${saKeyPath}`);
    authOpts = {
      keyFile: saKeyPath,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    };
  }

  const auth = new GoogleAuth(authOpts);
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function generateOneImage(prompt, token, projectId) {
  const apiPath = `/v1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await httpsReq(
      "POST",
      `https://${API_HOST}${apiPath}`,
      {
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: "1:1", outputOptions: { mimeType: "image/png" } },
      },
      { Authorization: `Bearer ${token}` }
    );

    if (res.status === 200) {
      const b64 = res.body?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) throw new Error("이미지 데이터 없음");
      return Buffer.from(b64, "base64");
    }

    if (res.status === 429) {
      const wait = 60 * attempt;
      console.log(`  할당량 초과, ${wait}초 후 재시도 (${attempt}/5)...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }

    throw new Error(`Imagen API error ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
  }

  throw new Error("Imagen API: 재시도 횟수 초과");
}

export async function generateImages(scenario, imagesDir) {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  if (!projectId) throw new Error("GOOGLE_PROJECT_ID가 .env에 없습니다.");

  const token = await getGoogleToken();
  const cuts = scenario.cuts || [];

  for (const cut of cuts) {
    const num     = cut.cut_number;
    const padded  = String(num).padStart(2, "0");
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
  }
}
