import { statSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export function assembleVideo(scenario, videosDir, bgmPath, outPath, textOverlayDir = null) {
  const ffmpeg   = process.env.FFMPEG_PATH || "ffmpeg";
  const cuts     = scenario.cuts || [];
  const N        = cuts.length;
  const totalDur = N * 5;
  const hasBgm   = existsSync(bgmPath);

  const inputs = cuts.map((c) => {
    const padded = String(c.cut_number).padStart(2, "0");
    return join(videosDir, `cut_${padded}.mp4`);
  });

  const missing = inputs.filter((p) => !existsSync(p));
  if (missing.length > 0) throw new Error(`누락된 클립: ${missing.join(", ")}`);

  // 텍스트 오버레이 PNG 목록
  let textPngs = [];
  if (textOverlayDir && existsSync(textOverlayDir)) {
    const candidates = cuts.map((c) => {
      const padded = String(c.cut_number).padStart(2, "0");
      return join(textOverlayDir, `cut_${padded}.png`);
    });
    if (candidates.every((p) => existsSync(p))) {
      textPngs = candidates;
    } else {
      console.warn("  경고: 텍스트 오버레이 PNG 일부 없음, 텍스트 합성 건너뜀");
    }
  }

  const useText = textPngs.length > 0;
  const bgmIdx  = N + (useText ? N : 0); // BGM 입력 인덱스

  const inputArgs      = inputs.map((f) => `-i "${f}"`).join(" ");
  const textInputArgs  = useText ? textPngs.map((f) => `-i "${f}"`).join(" ") : "";
  const bgmArgs        = hasBgm ? `-ss 12 -i "${bgmPath}"` : "";

  let filterComplex;
  if (useText) {
    const scaleFilters   = inputs.map((_, i) =>
      `[${i}:v]trim=duration=5,setpts=PTS-STARTPTS,scale=1080:1920[vs${i}]`
    ).join(";");
    const overlayFilters = inputs.map((_, i) =>
      `[vs${i}][${N + i}:v]overlay=0:0:eof_action=repeat[v${i}]`
    ).join(";");
    const vConcat = inputs.map((_, i) => `[v${i}]`).join("") + `concat=n=${N}:v=1:a=0[vout]`;
    filterComplex = `${scaleFilters};${overlayFilters};${vConcat}`;
  } else {
    const vFilters = inputs.map((_, i) =>
      `[${i}:v]trim=duration=5,setpts=PTS-STARTPTS,scale=1080:1920[v${i}]`
    ).join(";");
    const vConcat = inputs.map((_, i) => `[v${i}]`).join("") + `concat=n=${N}:v=1:a=0[vout]`;
    filterComplex = `${vFilters};${vConcat}`;
  }

  let mapArgs;
  if (hasBgm) {
    const fadeOut = totalDur - 3;
    mapArgs = `-map "[vout]" -map ${bgmIdx}:a -af "atrim=duration=${totalDur},afade=t=in:st=0:d=1,afade=t=out:st=${fadeOut}:d=3,volume=0.30"`;
  } else {
    mapArgs = `-map "[vout]" -an`;
  }

  const cmd = [
    `"${ffmpeg}"`,
    `-y`,
    inputArgs,
    textInputArgs,
    bgmArgs,
    `-filter_complex "${filterComplex}"`,
    mapArgs,
    `-c:v libx264 -preset slow -crf 18`,
    hasBgm ? `-c:a aac -b:a 128k` : ``,
    `-movflags +faststart`,
    `"${outPath}"`,
  ].filter(Boolean).join(" ");

  execSync(cmd, { stdio: "inherit", windowsHide: true });

  const sizeMB = (statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`  완성: ${outPath} (${sizeMB} MB, ~${totalDur}초)`);
  if (hasBgm) console.log("  BGM: 포함 (볼륨 30%, 페이드 인/아웃)");
  if (useText) console.log("  텍스트: ffmpeg 합성 (Kling 외부 처리)");
}
