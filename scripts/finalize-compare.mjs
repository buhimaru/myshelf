import sharp from "sharp";

const crop = { left: 50, top: 430, width: 220, height: 190 };
await sharp("public/images/shelf-background.png")
  .extract(crop)
  .png()
  .toFile("public/images/ref/compare-spine-after.png");
await sharp("public/images/ref/bg-before-spine-fix.png")
  .extract(crop)
  .png()
  .toFile("public/images/ref/compare-spine-before.png");
await sharp("public/images/ref/goal-normalized.png")
  .extract(crop)
  .png()
  .toFile("public/images/ref/compare-spine-goal.png");

const W = 340;
const H = 220;
const mk = async (p) =>
  sharp(p)
    .extract({ left: 40, top: 400, width: 280, height: 220 })
    .resize(W, H)
    .png()
    .toBuffer();
const [b, a, g] = await Promise.all([
  mk("public/images/ref/bg-before-spine-fix.png"),
  mk("public/images/shelf-background.png"),
  mk("public/images/ref/goal-normalized.png"),
]);
const label = (t) =>
  Buffer.from(
    `<svg width="${W}" height="24"><text x="${W / 2}" y="16" text-anchor="middle" fill="#fff" font-size="13" font-family="sans-serif">${t}</text></svg>`,
  );
await sharp({
  create: {
    width: W * 3 + 20,
    height: H + 34,
    channels: 3,
    background: { r: 20, g: 20, b: 22 },
  },
})
  .composite([
    { input: label("BEFORE"), left: 0, top: 4 },
    { input: label("AFTER"), left: W + 10, top: 4 },
    { input: label("GOAL"), left: (W + 10) * 2, top: 4 },
    { input: b, left: 0, top: 28 },
    { input: a, left: W + 10, top: 28 },
    { input: g, left: (W + 10) * 2, top: 28 },
  ])
  .png()
  .toFile("public/images/ref/compare-before-after-goal.png");

const before = await sharp("public/images/ref/bg-before-spine-fix.png")
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const after = await sharp("public/images/shelf-background.png")
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const w = before.info.width;
const h = before.info.height;
const mask = Buffer.alloc(w * h * 3);
let outDiff = 0;
let inDiff = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const mi = (y * w + x) * 3;
    const d =
      Math.abs(before.data[i] - after.data[i]) +
      Math.abs(before.data[i + 1] - after.data[i + 1]) +
      Math.abs(before.data[i + 2] - after.data[i + 2]);
    const inSpine = x >= 72 && x <= 208 && y >= 457 && y <= 595;
    if (d > 0) {
      if (inSpine) {
        mask[mi] = 220;
        mask[mi + 1] = 40;
        mask[mi + 2] = 40;
        inDiff++;
      } else {
        mask[mi] = 40;
        mask[mi + 1] = 220;
        mask[mi + 2] = 40;
        outDiff++;
      }
    }
  }
}
await sharp(mask, { raw: { width: w, height: h, channels: 3 } })
  .png()
  .toFile("public/images/ref/diff-nonspine.png");

// Zoom pair after|goal
const zCrop = { left: 60, top: 450, width: 180, height: 160 };
const za = await sharp("public/images/shelf-background.png")
  .extract(zCrop)
  .resize(360, 320, { kernel: "nearest" })
  .png()
  .toBuffer();
const zg = await sharp("public/images/ref/goal-normalized.png")
  .extract(zCrop)
  .resize(360, 320, { kernel: "nearest" })
  .png()
  .toBuffer();
await sharp({
  create: {
    width: 740,
    height: 350,
    channels: 3,
    background: { r: 20, g: 20, b: 22 },
  },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="360" height="24"><text x="180" y="16" text-anchor="middle" fill="#fff" font-size="13">AFTER zoom</text></svg>`,
      ),
      left: 0,
      top: 4,
    },
    {
      input: Buffer.from(
        `<svg width="360" height="24"><text x="180" y="16" text-anchor="middle" fill="#fff" font-size="13">GOAL zoom</text></svg>`,
      ),
      left: 380,
      top: 4,
    },
    { input: za, left: 0, top: 28 },
    { input: zg, left: 380, top: 28 },
  ])
  .png()
  .toFile("public/images/ref/zoom-after-vs-goal.png");

console.log({ inDiff, outDiff });
