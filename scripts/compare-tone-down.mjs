import sharp from "sharp";
import fs from "fs";

const older = fs.existsSync("public/images/ref/bg-before-book5-tops.png")
  ? "public/images/ref/bg-before-book5-tops.png"
  : "public/images/ref/bg-before-tone-down.png";
const after = "public/images/shelf-background.png";
const ideal = "public/images/ref/ideal-normalized-918.png";

console.log("older source:", older);

const cropTops = { left: 60, top: 460, width: 180, height: 50 };
const cropB5 = { left: 175, top: 455, width: 70, height: 60 };

async function zoom(src, crop, w, h, out) {
  await sharp(src)
    .extract(crop)
    .resize(w, h, { kernel: "lanczos3" })
    .png()
    .toFile(out);
}

await zoom(older, cropTops, 540, 150, "public/images/ref/cmp-tone-older-tops.png");
await zoom(after, cropTops, 540, 150, "public/images/ref/cmp-tone-after-tops.png");
await zoom(ideal, cropTops, 540, 150, "public/images/ref/cmp-tone-ideal-tops.png");
await zoom(older, cropB5, 280, 240, "public/images/ref/cmp-tone-older-b5.png");
await zoom(after, cropB5, 280, 240, "public/images/ref/cmp-tone-after-b5.png");
await zoom(ideal, cropB5, 280, 240, "public/images/ref/cmp-tone-ideal-b5.png");

const lab = (tw, t) =>
  Buffer.from(
    `<svg width="${tw}" height="22"><text x="${tw / 2}" y="15" text-anchor="middle" fill="#fff" font-size="12" font-family="sans-serif">${t}</text></svg>`,
  );

{
  const W = 540;
  const H = 150;
  const [o, a, i] = await Promise.all([
    sharp("public/images/ref/cmp-tone-older-tops.png").png().toBuffer(),
    sharp("public/images/ref/cmp-tone-after-tops.png").png().toBuffer(),
    sharp("public/images/ref/cmp-tone-ideal-tops.png").png().toBuffer(),
  ]);
  await sharp({
    create: {
      width: W * 3 + 20,
      height: H + 30,
      channels: 3,
      background: { r: 16, g: 16, b: 18 },
    },
  })
    .composite([
      { input: lab(W, "OLDER (exaggerated)"), left: 0, top: 2 },
      { input: lab(W, "AFTER (tone-down)"), left: W + 10, top: 2 },
      { input: lab(W, "IDEAL"), left: (W + 10) * 2, top: 2 },
      { input: o, left: 0, top: 26 },
      { input: a, left: W + 10, top: 26 },
      { input: i, left: (W + 10) * 2, top: 26 },
    ])
    .png()
    .toFile("public/images/ref/compare-tone-tops.png");
}

{
  const W = 280;
  const H = 240;
  const [o, a, i] = await Promise.all([
    sharp("public/images/ref/cmp-tone-older-b5.png").png().toBuffer(),
    sharp("public/images/ref/cmp-tone-after-b5.png").png().toBuffer(),
    sharp("public/images/ref/cmp-tone-ideal-b5.png").png().toBuffer(),
  ]);
  await sharp({
    create: {
      width: W * 3 + 20,
      height: H + 30,
      channels: 3,
      background: { r: 16, g: 16, b: 18 },
    },
  })
    .composite([
      { input: lab(W, "OLDER book5"), left: 0, top: 2 },
      { input: lab(W, "AFTER book5"), left: W + 10, top: 2 },
      { input: lab(W, "IDEAL book5"), left: (W + 10) * 2, top: 2 },
      { input: o, left: 0, top: 26 },
      { input: a, left: W + 10, top: 26 },
      { input: i, left: (W + 10) * 2, top: 26 },
    ])
    .png()
    .toFile("public/images/ref/compare-tone-book5.png");
}

// Side-by-side AFTER vs IDEAL only (same scale) for final report
{
  const W = 540;
  const H = 150;
  const [a, i] = await Promise.all([
    sharp("public/images/ref/cmp-tone-after-tops.png").png().toBuffer(),
    sharp("public/images/ref/cmp-tone-ideal-tops.png").png().toBuffer(),
  ]);
  await sharp({
    create: {
      width: W * 2 + 10,
      height: H + 30,
      channels: 3,
      background: { r: 16, g: 16, b: 18 },
    },
  })
    .composite([
      { input: lab(W, "AFTER"), left: 0, top: 2 },
      { input: lab(W, "IDEAL"), left: W + 10, top: 2 },
      { input: a, left: 0, top: 26 },
      { input: i, left: W + 10, top: 26 },
    ])
    .png()
    .toFile("public/images/ref/final-after-vs-ideal-tops.png");
}

{
  const W = 280;
  const H = 240;
  const [a, i] = await Promise.all([
    sharp("public/images/ref/cmp-tone-after-b5.png").png().toBuffer(),
    sharp("public/images/ref/cmp-tone-ideal-b5.png").png().toBuffer(),
  ]);
  await sharp({
    create: {
      width: W * 2 + 10,
      height: H + 30,
      channels: 3,
      background: { r: 16, g: 16, b: 18 },
    },
  })
    .composite([
      { input: lab(W, "AFTER book5"), left: 0, top: 2 },
      { input: lab(W, "IDEAL book5"), left: W + 10, top: 2 },
      { input: a, left: 0, top: 26 },
      { input: i, left: W + 10, top: 26 },
    ])
    .png()
    .toFile("public/images/ref/final-after-vs-ideal-book5.png");
}

// Diff vs older exaggerated
const olderRaw = await sharp(older)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const afterRaw = await sharp(after)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const bw = olderRaw.info.width;
const bh = olderRaw.info.height;
let outN = 0;
let inN = 0;
for (let y = 0; y < bh; y++) {
  for (let x = 0; x < bw; x++) {
    const i = (y * bw + x) * 4;
    const d =
      Math.abs(olderRaw.data[i] - afterRaw.data[i]) +
      Math.abs(olderRaw.data[i + 1] - afterRaw.data[i + 1]) +
      Math.abs(olderRaw.data[i + 2] - afterRaw.data[i + 2]);
    if (d > 0) {
      const ok =
        (x >= 72 && x <= 208 && y >= 460 && y <= 476) ||
        (x >= 209 && x <= 230 && y >= 448 && y <= 530);
      if (ok) inN++;
      else outN++;
    }
  }
}
console.log({ inN, outN, older });
