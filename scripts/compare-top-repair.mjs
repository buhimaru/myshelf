import sharp from "sharp";
import fs from "fs";

const crop = { left: 55, top: 445, width: 175, height: 70 };
const zoom = async (src, out) =>
  sharp(src)
    .extract(crop)
    .resize(525, 210, { kernel: "nearest" })
    .png()
    .toFile(out);

await zoom(
  "public/images/ref/bg-before-top-repair.png",
  "public/images/ref/spine-top-before-repair.png",
);
await zoom(
  "public/images/shelf-background.png",
  "public/images/ref/spine-top-after-repair.png",
);

const goalPath = fs.existsSync("public/images/ref/goal-normalized.png")
  ? "public/images/ref/goal-normalized.png"
  : "public/images/ref/goal-top-ref.jpg";

if (goalPath.endsWith(".png")) {
  await zoom(goalPath, "public/images/ref/spine-top-goal-zoom.png");
} else {
  await sharp(goalPath)
    .extract({ left: 70, top: 400, width: 160, height: 65 })
    .resize(525, 210, { kernel: "nearest" })
    .png()
    .toFile("public/images/ref/spine-top-goal-zoom.png");
}

const W = 350;
const H = 140;
const mk = async (p) => sharp(p).resize(W, H).png().toBuffer();
const [b, a, g] = await Promise.all([
  mk("public/images/ref/spine-top-before-repair.png"),
  mk("public/images/ref/spine-top-after-repair.png"),
  mk("public/images/ref/spine-top-goal-zoom.png"),
]);
const lab = (t) =>
  Buffer.from(
    `<svg width="${W}" height="22"><text x="${W / 2}" y="15" text-anchor="middle" fill="#fff" font-size="12" font-family="sans-serif">${t}</text></svg>`,
  );

await sharp({
  create: {
    width: W * 3 + 20,
    height: H + 30,
    channels: 3,
    background: { r: 20, g: 20, b: 22 },
  },
})
  .composite([
    { input: lab("BEFORE (ghost)"), left: 0, top: 2 },
    { input: lab("AFTER (repaired)"), left: W + 10, top: 2 },
    { input: lab("GOAL"), left: (W + 10) * 2, top: 2 },
    { input: b, left: 0, top: 26 },
    { input: a, left: W + 10, top: 26 },
    { input: g, left: (W + 10) * 2, top: 26 },
  ])
  .png()
  .toFile("public/images/ref/spine-top-compare.png");

const before = await sharp("public/images/ref/bg-before-top-repair.png")
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
let outN = 0;
let inN = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const mi = (y * w + x) * 3;
    const d =
      Math.abs(before.data[i] - after.data[i]) +
      Math.abs(before.data[i + 1] - after.data[i + 1]) +
      Math.abs(before.data[i + 2] - after.data[i + 2]);
    const inZone = x >= 70 && x <= 210 && y >= 448 && y <= 480;
    if (d > 0) {
      if (inZone) {
        mask[mi] = 220;
        mask[mi + 1] = 40;
        mask[mi + 2] = 40;
        inN++;
      } else {
        mask[mi] = 40;
        mask[mi + 1] = 220;
        mask[mi + 2] = 40;
        outN++;
      }
    }
  }
}
await sharp(mask, { raw: { width: w, height: h, channels: 3 } })
  .png()
  .toFile("public/images/ref/diff-top-repair.png");

console.log({ inN, outN, wrote: "spine-top-compare.png" });
