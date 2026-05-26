#!/usr/bin/env node
/**
 * 쇼츠 파이프라인
 *
 * 사용법:
 *   node run.mjs "주제명"
 *   node run.mjs "주제명" --scenario path/to/scenario.json  (기존 시나리오 사용)
 *   node run.mjs "주제명" --from images                     (이미지부터 재시작)
 *   node run.mjs "주제명" --from videos                     (영상부터 재시작)
 *   node run.mjs "주제명" --from assemble                   (조립만 다시)
 */

import { mkdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { createInterface } from "readline";
import { execSync } from "child_process";
import { loadEnv, ROOT, slugify } from "./steps/utils.mjs";
import { generateScenario } from "./steps/01_scenario.mjs";
import { generateImages }   from "./steps/02_images.mjs";
import { applyOverlays }    from "./steps/03_overlay.mjs";
import { generateVideos }   from "./steps/04_videos.mjs";
import { assembleVideo }    from "./steps/05_assemble.mjs";

loadEnv();

// ── 인자 파싱 ─────────────────────────────────────────────────
const args = process.argv.slice(2);
const topic = args.find((a) => !a.startsWith("--")) || "";

if (!topic) {
  console.error('사용법: node run.mjs "주제명"');
  console.error('예시:   node run.mjs "경복궁 야경 쇼츠"');
  process.exit(1);
}

const fromFlag  = args.indexOf("--from");
const fromStep  = fromFlag !== -1 ? args[fromFlag + 1] : "scenario";

const toFlag  = args.indexOf("--to");
const toStep  = toFlag !== -1 ? args[toFlag + 1] : "assemble";

const scenarioFlag = args.indexOf("--scenario");
const scenarioFile = scenarioFlag !== -1 ? resolve(args[scenarioFlag + 1]) : null;

const bgmFlag  = args.indexOf("--bgm");
const customBgm = bgmFlag !== -1 ? resolve(args[bgmFlag + 1]) : null;

// --cut 1,3,5  →  특정 컷 번호만 처리 (미리보기용)
const cutFlag   = args.indexOf("--cut");
const cutFilter = cutFlag !== -1
  ? new Set(args[cutFlag + 1].split(",").map(Number))
  : null;

// ── 경로 설정 ─────────────────────────────────────────────────
const slug            = slugify(topic);
const outDir          = join(ROOT, "output", slug);
const imagesDir       = join(outDir, "images");
const overlayDir      = join(outDir, "images_overlay");
const textOverlayDir  = join(outDir, "images_text_overlay");
const videosDir       = join(outDir, "videos");
const scenarioPath    = join(outDir, "scenario.json");
const bgmPath         = customBgm || join(ROOT, "bgm.mp3");
const finalPath       = join(outDir, "final.mp4");

for (const dir of [outDir, imagesDir, overlayDir, textOverlayDir, videosDir]) {
  mkdirSync(dir, { recursive: true });
}

const STEPS = ["scenario", "images", "overlay", "videos", "assemble"];
const startIdx = STEPS.indexOf(fromStep);
const endIdx   = STEPS.indexOf(toStep);
if (startIdx === -1) {
  console.error(`--from 값이 잘못됨: ${fromStep}`);
  console.error(`가능한 값: ${STEPS.join(", ")}`);
  process.exit(1);
}
if (endIdx === -1) {
  console.error(`--to 값이 잘못됨: ${toStep}`);
  console.error(`가능한 값: ${STEPS.join(", ")}`);
  process.exit(1);
}

function shouldRun(stepName) {
  const idx = STEPS.indexOf(stepName);
  return idx >= startIdx && idx <= endIdx;
}

async function waitForImageReview(dir) {
  console.log(`\n이미지 생성 완료! 아래 폴더에서 확인하세요:`);
  console.log(`  ${dir}`);
  try { execSync(`explorer "${dir}"`, { windowsHide: true }); } catch (_) {}
  console.log();
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n쇼츠 파이프라인 시작: "${topic}"`);
  console.log(`출력 폴더: ${outDir}\n`);

  // 1. 시나리오
  let scenario;
  if (!shouldRun("scenario") && existsSync(scenarioPath)) {
    scenario = JSON.parse(readFileSync(scenarioPath, "utf-8"));
    console.log(`[1/5] 시나리오 로드 (기존): ${scenario.cuts.length}컷`);
  } else if (scenarioFile) {
    scenario = JSON.parse(readFileSync(scenarioFile, "utf-8"));
    console.log(`[1/5] 시나리오 로드 (파일): ${scenario.cuts.length}컷`);
  } else {
    console.log("[1/5] 시나리오 생성 중 (Claude API)...");
    scenario = await generateScenario(topic, scenarioPath);
    console.log(`  ${scenario.cuts.length}컷 완료`);
  }
  console.log();

  // --cut 필터 적용
  const filteredScenario = cutFilter
    ? { ...scenario, cuts: scenario.cuts.filter(c => cutFilter.has(c.cut_number)) }
    : scenario;
  if (cutFilter) {
    console.log(`컷 필터: ${[...cutFilter].join(", ")}번만 처리\n`);
  }

  // 2. 이미지
  if (shouldRun("images")) {
    console.log("[2/5] 이미지 생성 중 (Vertex AI Imagen 3)...");
    await generateImages(filteredScenario, imagesDir);
    await waitForImageReview(imagesDir);
  } else {
    console.log("[2/5] 이미지 건너뜀 (--from 설정)\n");
  }

  // 3. 오버레이
  if (shouldRun("overlay")) {
    console.log("[3/5] 텍스트 오버레이 적용 중 (Puppeteer)...");
    await applyOverlays(filteredScenario, imagesDir, overlayDir, textOverlayDir);
    console.log();
  } else {
    console.log("[3/5] 오버레이 건너뜀 (--from 설정)\n");
  }

  // 4. 영상
  if (shouldRun("videos")) {
    console.log("[4/5] 영상 생성 중 (Kling API)...");
    await generateVideos(scenario, imagesDir, videosDir);
    console.log();
  } else {
    console.log("[4/5] 영상 건너뜀 (--from 설정)\n");
  }

  // 5. 조립
  if (shouldRun("assemble")) {
    console.log("[5/5] 최종 영상 조립 중 (ffmpeg)...");
    assembleVideo(scenario, videosDir, bgmPath, finalPath, textOverlayDir);
    console.log();
  }

  if (shouldRun("assemble")) {
    console.log(`완성: ${finalPath}`);
    console.log(`SEO 제목: ${scenario.seo?.youtube_title || ""}`);
    console.log(`해시태그: ${(scenario.seo?.hashtags || []).join(" ")}`);
  } else {
    console.log(`미리보기 완료 — 오버레이 이미지: ${overlayDir}`);
  }
}

main().catch((e) => {
  console.error("\n오류:", e.message);
  process.exit(1);
});
