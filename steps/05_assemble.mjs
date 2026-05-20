import { statSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export function assembleVideo(scenario, videosDir, bgmPath, outPath) {
  const ffmpeg   = process.env.FFMPEG_PATH || "ffmpeg";
  const cuts     = scenario.cuts || [];
  const N        = cuts.length;
  const totalDur = N * 5;
  const hasBgm   = existsSync(bgmPath);

  const inputs = cuts.map((c) => {
    const padded = String(c.cut_number).padStart(2, "0");
    return join(videosDir, `cut_${padded}.mp4`);
  });

  // 누락된 클립 확인
  const missing = inputs.filter((p) => !existsSync(p));
  if (missing.length > 0) throw new Error(`누락된 클립: ${missing.join(", ")}`);

  const vFilters = inputs
    .map((_, i) => `[${i}:v]trim=duration=5,setpts=PTS-STARTPTS,scale=1080:1080[v${i}]`)
    .join(";");
  const vConcat = inputs.map((_, i) => `[v${i}]`).join("") + `concat=n=${N}:v=1:a=0[vout]`;
  const filterComplex = `${vFilters};${vConcat}`;

  const inputArgs = inputs.map((f) => `-i "${f}"`).join(" ");
  const bgmArgs   = hasBgm ? `-i "${bgmPath}"` : "";

  let mapArgs;
  if (hasBgm) {
    const fadeOut = totalDur - 3;
    mapArgs = `-map "[vout]" -map ${N}:a -af "atrim=duration=${totalDur},afade=t=in:st=0:d=1,afade=t=out:st=${fadeOut}:d=3,volume=0.30"`;
  } else {
    mapArgs = `-map "[vout]" -an`;
  }

  const cmd = [
    `"${ffmpeg}"`,
    `-y`,
    inputArgs,
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
}
