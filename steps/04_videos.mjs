import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { httpsReq, downloadFile, makeKlingJwt, sleep } from "./utils.mjs";

const KLING_BASE      = "https://api.klingai.com";
const POLL_INTERVAL   = 15_000;
const MAX_WAIT        = 600_000; // 10분
const BATCH_SIZE      = 3;       // Kling 동시 작업 한도 이하로 유지

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

async function waitForTask(taskId, padded) {
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
      throw new Error(`cut_${padded} poll error: ${JSON.stringify(res.body).slice(0, 200)}`);
    }
    const status = res.body.data.task_status;
    console.log(`  cut_${padded} 상태: ${status}`);
    if (status === "succeed") {
      return res.body.data?.task_result?.videos?.[0]?.url || null;
    }
    if (status === "failed" || status === "error") {
      throw new Error(`cut_${padded} 실패: ${res.body.data.task_status_msg || ""}`);
    }
  }
  throw new Error(`cut_${padded} TIMEOUT (10분 초과)`);
}

export async function generateVideos(scenario, imagesDir, videosDir) {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY가 .env에 없습니다.");

  const cuts = scenario.cuts || [];

  // 1단계: 이미 있는 컷 제외하고 작업 목록 구성
  const pending = cuts.filter((cut) => {
    const padded  = String(cut.cut_number).padStart(2, "0");
    const vidPath = join(videosDir, `cut_${padded}.mp4`);
    if (existsSync(vidPath)) {
      console.log(`  cut_${padded}: 영상 이미 존재, 건너뜀`);
      return false;
    }
    const imgPath = join(imagesDir, `cut_${padded}.png`);
    if (!existsSync(imgPath)) {
      console.log(`  cut_${padded}: 원본 이미지 없음, 건너뜀`);
      return false;
    }
    return true;
  });

  if (pending.length === 0) {
    console.log("  모든 영상 이미 존재");
    return;
  }

  // 2단계: BATCH_SIZE개씩 묶어 제출 → 완료 → 다음 배치
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pending.length / BATCH_SIZE);
    console.log(`\n  [배치 ${batchNum}/${totalBatches}] ${batch.length}개 제출 중...`);

    // 배치 내 작업 순차 제출 (제출 자체도 동시에 하면 429 발생)
    const submitted = [];
    for (const cut of batch) {
      const padded  = String(cut.cut_number).padStart(2, "0");
      const imgPath = join(imagesDir, `cut_${padded}.png`);
      const taskId  = await submitTask(imgPath, cut.motion || "slow cinematic pan");
      console.log(`    cut_${padded} 제출 완료 → task: ${taskId}`);
      submitted.push({ padded, taskId, vidPath: join(videosDir, `cut_${padded}.mp4`) });
    }

    // 배치 내 영상 완료 병렬 대기
    console.log(`    ${submitted.length}개 생성 대기 중...`);
    await Promise.all(
      submitted.map(async ({ padded, taskId, vidPath }) => {
        const videoUrl = await waitForTask(taskId, padded);
        if (!videoUrl) throw new Error(`cut_${padded}: 영상 URL 없음`);
        await downloadFile(videoUrl, vidPath);
        const kb = Math.round(readFileSync(vidPath).length / 1024);
        console.log(`    cut_${padded} 저장 완료 (${kb} KB)`);
      })
    );
  }
}
