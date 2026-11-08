import sharp from "sharp";

const v2shot =
  "C:/Users/user/AppData/Local/Temp/cursor/screenshots/shelf-led-v2-with-works-pc.png";
const v3shot =
  "C:/Users/user/AppData/Local/Temp/cursor/screenshots/shelf-hd-v3-with-works-pc.png";
const v2bg = "public/images/shelf-left-led-v2-test.jpg";
const v3bg = "public/images/shelf-left-led-hd-v3-test.jpg";
const outWorks = "public/images/shelf-bg-compare-v2-vs-hd-v3-works.jpg";
const outBg = "public/images/shelf-bg-compare-v2-vs-hd-v3-material.jpg";

async function labelStrip(text, width) {
  const safe = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const svg = Buffer.from(
    `<svg width="${width}" height="36" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="#1c1917"/>` +
      `<text x="16" y="24" fill="#fafaf9" font-size="15" font-family="Segoe UI, Meiryo, sans-serif">${safe}</text>` +
      `</svg>`
  );
  return sharp(svg).png().toBuffer();
}

async function sideBySide(
  leftPath,
  rightPath,
  leftLabel,
  rightLabel,
  outPath,
  panelW
) {
  const leftImg = await sharp(leftPath)
    .resize({ width: panelW, withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const rightImg = await sharp(rightPath)
    .resize({ width: panelW, withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const lm = await sharp(leftImg).metadata();
  const rm = await sharp(rightImg).metadata();
  const h = Math.max(lm.height ?? 0, rm.height ?? 0);
  const gap = 8;
  const header = 36;
  const canvasW = panelW * 2 + gap;
  const canvasH = header + h;
  const leftH = await labelStrip(leftLabel, panelW);
  const rightH = await labelStrip(rightLabel, panelW);
  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: "#e7e5e4",
    },
  })
    .composite([
      { input: leftH, left: 0, top: 0 },
      { input: rightH, left: panelW + gap, top: 0 },
      { input: leftImg, left: 0, top: header },
      { input: rightImg, left: panelW + gap, top: header },
    ])
    .jpeg({ quality: 88 })
    .toFile(outPath);
  const m = await sharp(outPath).metadata();
  console.log(
    JSON.stringify({ outPath, w: m.width, h: m.height, bytes: m.size })
  );
}

await sideBySide(
  v2shot,
  v3shot,
  "旧試作 v2 + 作品配置",
  "新候補 HD v3 + 作品配置",
  outWorks,
  700
);
await sideBySide(v2bg, v3bg, "旧試作 v2 素材", "新候補 HD v3 素材", outBg, 512);
console.log("compare written");
