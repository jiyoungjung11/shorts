import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { httpsReq, downloadFile, makeKlingJwt, sleep } from "./utils.mjs";

const KLING_BASE    = "https://api.klingai.com";
const POLL_INTERVAL = 15000;
const MAX_WAIT      = 600000;

async function submitTask(imgPath, motion) {
  const b64 = readFileSync(imgPath).toString("base64");
  const res = await httpsReq(
    "POST",
    `${KLING_BASE}/v1/videos/image2video`,
    {
      model_name:   "kling-v1-6",
      mode:         "std",
      image:        b64,
      prompt:       motion.slice(0, 200),
      duration:     "5",
      aspect_ratio: "1:1",
      cfg_scale:    0.5,
    },
    { Authorization: `Bearer ${makeKlingJwt()}` }
  );

  if (res.status !== 200 || res.body?.code !== 0) {
    throw new Error(`Kling submit failed: HTTP ${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
  }
  return res.body.data.task_id;
}

async function pollTask(taskId) {
  const deadline = Date.now() + MAX_WAIT;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL);
    const res = await httpsReq(
      "GET",
      `${KLING_BASE}/v1/videos/image2video/${taskId}`,
      null,
      { Authorization: `Bearer ${makeKlingJwt()}` }
    );
    if (res.status !== 200 || res.body?.code !== 0) {
      throw new Error(`Poll error: ${JSON.stringify(res.body).slice(0, 200)}`);
    }
    const status = res.body.data.task_status;
    process.stdout.write(`    ${status}...`);
    if (status === "succeed") {
      console.log();
      return res.body.data?.task_result?.videos?.[0]?.url || null;
    }
    if (status === "failed" || status === "error") {
      throw new Error(`Task failed: ${res.body.data.task_status_msg || ""}`);
    }
  }
  throw new Error("TIMEOUT");
}

export async function generateVideos(scenario, overlayDir, videosDir) {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY가 .env에 없습니다.");

  const cuts = scenario.cuts || [];

  for (const cut of cuts) {
    const num     = cut.cut_number;
    const padded  = String(num).padStart(2, "0");
    const imgPath = join(overlayDir, `cut_${padded}.png`);
    const vidPath = join(videosDir,  `cut_${padded}.mp4`);

    if (existsSync(vidPath)) {
      console.log(`  cut_${padded}: 영상 이미 존재, 건너뜀`);
      continue;
    }
    if (!existsSync(imgPath)) {
      console.log(`  cut_${padded}: 오버레이 이미지 없음, 건너뜀`);
      continue;
    }

    const motion = cut.motion || "slow cinematic pan";
    console.log(`  cut_${padded}/${cuts.length} Kling 요청 중... `);
    const taskId = await submitTask(imgPath, motion);
    console.log(`    task: ${taskId}`);
    process.stdout.write("    polling: ");

    const videoUrl = await pollTask(taskId);
    if (!videoUrl) throw new Error(`cut_${padded}: 영상 URL 없음`);

    await downloadFile(videoUrl, vidPath);
    const kb = Math.round(readFileSync(vidPath).length / 1024);
    console.log(`  cut_${padded} 저장 (${kb} KB)`);
  }
}
