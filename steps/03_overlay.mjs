import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { pathToFileURL } from "url";

function buildTextOnlyHtml(main, sub, cutNum, total, korean = "") {
  const isCover = cutNum === 1 || cutNum === total;

  const outline = `-2px -2px 0 rgba(0,0,0,0.85), 2px -2px 0 rgba(0,0,0,0.85), -2px 2px 0 rgba(0,0,0,0.85), 2px 2px 0 rgba(0,0,0,0.85), 0 4px 24px rgba(0,0,0,0.95)`;
  const outlineSm = `-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9), 0 3px 16px rgba(0,0,0,0.95)`;

  const coverStyle = `
.overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 80px;
  text-align: center;
}
.korean {
  font-size: 128px; font-weight: 900;
  color: #fff; letter-spacing: 0.08em; line-height: 1.1;
  text-shadow: ${outline};
}
.main {
  font-size: 76px; font-weight: 900;
  color: #fff; letter-spacing: 0.10em; line-height: 1.2;
  text-shadow: ${outline};
  margin-top: 16px;
}
.sub {
  margin-top: 32px; font-size: 46px; font-weight: 600;
  color: #fff; letter-spacing: -0.01em; line-height: 1.55;
  text-shadow: ${outlineSm};
}`;

  const topBarStyle = `
.overlay {
  position: absolute; top: 0; left: 0; right: 0;
  padding: 160px 72px 160px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.93) 0%, rgba(0,0,0,0.78) 60%, rgba(0,0,0,0.20) 88%, transparent 100%);
}
.main {
  font-size: 100px; font-weight: 900;
  color: #fff; letter-spacing: -0.02em; line-height: 1.15;
  text-shadow: ${outline};
}
.sub {
  margin-top: 22px; font-size: 42px; font-weight: 600;
  color: #fff; letter-spacing: -0.01em; line-height: 1.55;
  text-shadow: ${outlineSm};
}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080, initial-scale=1.0">
<style>
@font-face {
  font-family: 'MalgunGothic';
  src: url('file:///C:/Windows/Fonts/malgun.ttf') format('truetype');
  font-weight: normal;
}
@font-face {
  font-family: 'MalgunGothic';
  src: url('file:///C:/Windows/Fonts/malgunbd.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1920px; overflow: hidden; background: transparent; }
#slide {
  width: 1080px; height: 1920px;
  position: relative; overflow: hidden;
  font-family: 'MalgunGothic', 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
}
${isCover ? coverStyle : topBarStyle}
.counter {
  position: absolute; bottom: 60px; right: 52px;
  font-size: 28px; font-weight: 600;
  color: rgba(255,255,255,0.5); letter-spacing: 0.04em;
}
</style>
</head>
<body>
<div id="slide">
  <div class="overlay">
    ${korean ? `<div class="korean">${korean}</div>` : ""}
    <div class="main">${main}</div>
    <div class="sub">${sub}</div>
  </div>
  <div class="counter">${String(cutNum).padStart(2, "0")} / ${total}</div>
</div>
</body>
</html>`;
}

function buildHtml(imgB64, main, sub, cutNum, total, korean = "") {
  const isCover = cutNum === 1 || cutNum === total;

  const outline = `-2px -2px 0 rgba(0,0,0,0.85), 2px -2px 0 rgba(0,0,0,0.85), -2px 2px 0 rgba(0,0,0,0.85), 2px 2px 0 rgba(0,0,0,0.85), 0 4px 24px rgba(0,0,0,0.95)`;
  const outlineSm = `-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9), 0 3px 16px rgba(0,0,0,0.95)`;

  const coverStyle = `
.overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 80px;
  text-align: center;
}
.korean {
  font-size: 128px; font-weight: 900;
  color: #fff; letter-spacing: 0.08em; line-height: 1.1;
  text-shadow: ${outline};
}
.main {
  font-size: 76px; font-weight: 900;
  color: #fff; letter-spacing: 0.10em; line-height: 1.2;
  text-shadow: ${outline};
  margin-top: 16px;
}
.sub {
  margin-top: 32px; font-size: 46px; font-weight: 600;
  color: #fff; letter-spacing: -0.01em; line-height: 1.55;
  text-shadow: ${outlineSm};
}`;

  const topBarStyle = `
.overlay {
  position: absolute; top: 0; left: 0; right: 0;
  padding: 160px 72px 160px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.93) 0%, rgba(0,0,0,0.78) 60%, rgba(0,0,0,0.20) 88%, transparent 100%);
}
.main {
  font-size: 100px; font-weight: 900;
  color: #fff; letter-spacing: -0.02em; line-height: 1.15;
  text-shadow: ${outline};
}
.sub {
  margin-top: 22px; font-size: 42px; font-weight: 600;
  color: #fff; letter-spacing: -0.01em; line-height: 1.55;
  text-shadow: ${outlineSm};
}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080, initial-scale=1.0">
<style>
@font-face {
  font-family: 'MalgunGothic';
  src: url('file:///C:/Windows/Fonts/malgun.ttf') format('truetype');
  font-weight: normal;
}
@font-face {
  font-family: 'MalgunGothic';
  src: url('file:///C:/Windows/Fonts/malgunbd.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
#slide {
  width: 1080px; height: 1920px;
  position: relative; overflow: hidden;
  font-family: 'MalgunGothic', 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
}
.bg { width: 100%; height: 100%; object-fit: cover; display: block; }
${isCover ? coverStyle : topBarStyle}
.counter {
  position: absolute; bottom: 60px; right: 52px;
  font-size: 28px; font-weight: 600;
  color: rgba(255,255,255,0.5); letter-spacing: 0.04em;
}
</style>
</head>
<body>
<div id="slide">
  <img class="bg" src="data:image/png;base64,${imgB64}" />
  <div class="overlay">
    ${korean ? `<div class="korean">${korean}</div>` : ""}
    <div class="main">${main}</div>
    <div class="sub">${sub}</div>
  </div>
  <div class="counter">${String(cutNum).padStart(2, "0")} / ${total}</div>
</div>
</body>
</html>`;
}

export async function applyOverlays(scenario, imagesDir, overlayDir, textOverlayDir = null) {
  const { default: puppeteer } = await import("puppeteer");
  const cuts  = scenario.cuts || [];
  const total = cuts.length;

  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: edgePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const cut of cuts) {
      const num     = cut.cut_number;
      const padded  = String(num).padStart(2, "0");
      const imgPath     = join(imagesDir,   `cut_${padded}.png`);
      const outPath     = join(overlayDir,  `cut_${padded}.png`);
      const textOutPath = textOverlayDir ? join(textOverlayDir, `cut_${padded}.png`) : null;

      const fullExists = existsSync(outPath);
      const textExists = !textOutPath || existsSync(textOutPath);

      if (fullExists && textExists) {
        console.log(`  cut_${padded}: 오버레이 이미 존재, 건너뜀`);
        continue;
      }
      if (!existsSync(imgPath)) {
        console.log(`  cut_${padded}: 이미지 없음, 건너뜀`);
        continue;
      }

      const main   = cut.title_overlay?.main   || "";
      const sub    = cut.title_overlay?.sub    || "";
      const korean = cut.title_overlay?.korean || "";

      // 전체 오버레이 (배경 이미지 포함)
      if (!fullExists) {
        const imgB64 = readFileSync(imgPath).toString("base64");
        const html   = buildHtml(imgB64, main, sub, num, total, korean);
        const tmpFile = join(tmpdir(), `overlay_cut${padded}.html`);
        writeFileSync(tmpFile, html, "utf-8");

        const page = await browser.newPage();
        await page.setViewport({ width: 1080, height: 1920 });
        await page.goto(pathToFileURL(tmpFile).href, { waitUntil: "networkidle0", timeout: 15000 });
        await new Promise((r) => setTimeout(r, 800));
        await page.screenshot({ path: outPath, type: "png" });
        await page.close();
        const kb = Math.round(readFileSync(outPath).length / 1024);
        console.log(`  cut_${padded} 오버레이 저장 (${kb} KB)`);
      }

      // 텍스트 전용 오버레이 (투명 배경)
      if (textOutPath && !existsSync(textOutPath)) {
        const textHtml = buildTextOnlyHtml(main, sub, num, total, korean);
        const tmpTextFile = join(tmpdir(), `text_overlay_cut${padded}.html`);
        writeFileSync(tmpTextFile, textHtml, "utf-8");

        const page2 = await browser.newPage();
        await page2.setViewport({ width: 1080, height: 1920 });
        await page2.goto(pathToFileURL(tmpTextFile).href, { waitUntil: "networkidle0", timeout: 15000 });
        await new Promise((r) => setTimeout(r, 800));
        await page2.screenshot({ path: textOutPath, type: "png", omitBackground: true, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
        await page2.close();
        const kb2 = Math.round(readFileSync(textOutPath).length / 1024);
        console.log(`  cut_${padded} 텍스트 오버레이 저장 (${kb2} KB)`);
      }
    }
  } finally {
    await browser.close();
  }
}
