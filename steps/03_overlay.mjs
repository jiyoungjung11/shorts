import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { pathToFileURL } from "url";

function buildHtml(imgB64, main, sub, cutNum, total) {
  const isCover = cutNum === 1 || cutNum === total;

  const coverStyle = `
.overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 80px;
  text-align: center;
}
.main {
  font-size: 80px; font-weight: 800;
  color: #fff; letter-spacing: -0.02em; line-height: 1.15;
  text-shadow: 0 3px 16px rgba(0,0,0,0.6);
}
.sub {
  margin-top: 24px; font-size: 36px; font-weight: 500;
  color: rgba(255,255,255,0.9); letter-spacing: -0.01em;
  text-shadow: 0 2px 10px rgba(0,0,0,0.5);
}`;

  const topBarStyle = `
.overlay {
  position: absolute; top: 0; left: 0; right: 0;
  padding: 60px 60px 80px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 65%, transparent 100%);
}
.main {
  font-size: 72px; font-weight: 800;
  color: #fff; letter-spacing: -0.02em; line-height: 1.15;
  text-shadow: 0 2px 12px rgba(0,0,0,0.5);
}
.sub {
  margin-top: 14px; font-size: 33px; font-weight: 500;
  color: rgba(255,255,255,0.92); letter-spacing: -0.01em;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080, initial-scale=1.0">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1080px; overflow: hidden; background: #000; }
#slide {
  width: 1080px; height: 1080px;
  position: relative; overflow: hidden;
  font-family: 'Pretendard', -apple-system, sans-serif;
}
.bg { width: 100%; height: 100%; object-fit: cover; display: block; }
${isCover ? coverStyle : topBarStyle}
.counter {
  position: absolute; bottom: 40px; right: 52px;
  font-size: 26px; font-weight: 600;
  color: rgba(255,255,255,0.5); letter-spacing: 0.04em;
}
</style>
</head>
<body>
<div id="slide">
  <img class="bg" src="data:image/png;base64,${imgB64}" />
  <div class="overlay">
    <div class="main">${main}</div>
    <div class="sub">${sub}</div>
  </div>
  <div class="counter">${String(cutNum).padStart(2, "0")} / ${total}</div>
</div>
</body>
</html>`;
}

export async function applyOverlays(scenario, imagesDir, overlayDir) {
  const { default: puppeteer } = await import("puppeteer");
  const cuts  = scenario.cuts || [];
  const total = cuts.length;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const cut of cuts) {
      const num     = cut.cut_number;
      const padded  = String(num).padStart(2, "0");
      const imgPath = join(imagesDir,  `cut_${padded}.png`);
      const outPath = join(overlayDir, `cut_${padded}.png`);

      if (existsSync(outPath)) {
        console.log(`  cut_${padded}: 오버레이 이미 존재, 건너뜀`);
        continue;
      }
      if (!existsSync(imgPath)) {
        console.log(`  cut_${padded}: 이미지 없음, 건너뜀`);
        continue;
      }

      const imgB64   = readFileSync(imgPath).toString("base64");
      const main     = cut.title_overlay?.main || "";
      const sub      = cut.title_overlay?.sub  || "";
      const html     = buildHtml(imgB64, main, sub, num, total);

      const tmpFile = join(tmpdir(), `overlay_cut${padded}.html`);
      writeFileSync(tmpFile, html, "utf-8");

      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080 });
      await page.goto(pathToFileURL(tmpFile).href, { waitUntil: "networkidle0" });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: outPath, type: "png" });
      await page.close();

      const kb = Math.round(readFileSync(outPath).length / 1024);
      console.log(`  cut_${padded} 오버레이 저장 (${kb} KB)`);
    }
  } finally {
    await browser.close();
  }
}
