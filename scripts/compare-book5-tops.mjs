import sharp from "sharp";

const before = "public/images/ref/bg-before-book5-tops.png";
const after = "public/images/shelf-background.png";
const goal = "public/images/ref/goal-901.png";

// 1) Book 5 top-right zoom
const c1 = { left: 175, top: 450, width: 70, height: 55 };
await sharp(before)
  .extract(c1)
  .resize(350, 275, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/cmp-book5-before.png");
await sharp(after)
  .extract(c1)
  .resize(350, 275, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/cmp-book5-after.png");

// 2) Tops 1-5 zoom
const c2 = { left: 60, top: 460, width: 170, height: 45 };
await sharp(before)
  .extract(c2)
  .resize(510, 135, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/cmp-tops-before.png");
await sharp(after)
  .extract(c2)
  .resize(510, 135, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/cmp-tops-after.png");

// Goal crops (goal is 1024x? — normalize roughly)
const gm = await sharp(goal).metadata();
console.log("goal size", gm.width, gm.height);
// Goal shelf similar; bottom-left approx
await sharp(goal)
  .extract({ left: 70, top: 430, width: 160, height: 50 })
  .resize(510, 135, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/cmp-tops-goal.png");
await sharp(goal)
  .extract({ left: 160, top: 420, width: 80, height: 60 })
  .resize(350, 275, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/cmp-book5-goal.png");

const lab = (w, t) =>
  Buffer.from(
    `<svg width="${w}" height="22"><text x="${w / 2}" y="15" text-anchor="middle" fill="#fff" font-size="12" font-family="sans-serif">${t}</text></svg>`,
  );

// Compare 1: book5 TR
{
  const b = await sharp("public/images/ref/cmp-book5-before.png").png().toBuffer();
  const a = await sharp("public/images/ref/cmp-book5-after.png").png().toBuffer();
  const g = await sharp("public/images/ref/cmp-book5-goal.png").png().toBuffer();
  const W = 350;
  const H = 275;
  await sharp({
    create: {
      width: W * 3 + 20,
      height: H + 30,
      channels: 3,
      background: { r: 18, g: 18, b: 20 },
    },
  })
    .composite([
      { input: lab(W, "BEFORE book5 TR"), left: 0, top: 2 },
      { input: lab(W, "AFTER book5 TR"), left: W + 10, top: 2 },
      { input: lab(W, "GOAL book5 TR"), left: (W + 10) * 2, top: 2 },
      { input: b, left: 0, top: 26 },
      { input: a, left: W + 10, top: 26 },
      { input: g, left: (W + 10) * 2, top: 26 },
    ])
    .png()
    .toFile("public/images/ref/compare-1-book5-tr.png");
}

// Compare 2: tops
{
  const b = await sharp("public/images/ref/cmp-tops-before.png").png().toBuffer();
  const a = await sharp("public/images/ref/cmp-tops-after.png").png().toBuffer();
  const g = await sharp("public/images/ref/cmp-tops-goal.png").png().toBuffer();
  const W = 510;
  const H = 135;
  await sharp({
    create: {
      width: W * 3 + 20,
      height: H + 30,
      channels: 3,
      background: { r: 18, g: 18, b: 20 },
    },
  })
    .composite([
      { input: lab(W, "BEFORE tops"), left: 0, top: 2 },
      { input: lab(W, "AFTER tops"), left: W + 10, top: 2 },
      { input: lab(W, "GOAL tops"), left: (W + 10) * 2, top: 2 },
      { input: b, left: 0, top: 26 },
      { input: a, left: W + 10, top: 26 },
      { input: g, left: (W + 10) * 2, top: 26 },
    ])
    .png()
    .toFile("public/images/ref/compare-2-tops.png");
}

// Compare 3: full shelf after
await sharp(after).png().toFile("public/images/ref/compare-3-full-after.png");

// Diff outside allowed zone
const beforeRaw = await sharp(before)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const afterRaw = await sharp(after)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const bw = beforeRaw.info.width;
const bh = beforeRaw.info.height;
let outN = 0;
let inN = 0;
const mask = Buffer.alloc(bw * bh * 3);
for (let y = 0; y < bh; y++) {
  for (let x = 0; x < bw; x++) {
    const i = (y * bw + x) * 4;
    const mi = (y * bw + x) * 3;
    const d =
      Math.abs(beforeRaw.data[i] - afterRaw.data[i]) +
      Math.abs(beforeRaw.data[i + 1] - afterRaw.data[i + 1]) +
      Math.abs(beforeRaw.data[i + 2] - afterRaw.data[i + 2]);
    const inZone =
      (x >= 70 && x <= 232 && y >= 448 && y <= 483) ||
      (x >= 209 && x <= 228 && y >= 448 && y <= 482);
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
await sharp(mask, { raw: { width: bw, height: bh, channels: 3 } })
  .png()
  .toFile("public/images/ref/diff-book5-tops.png");

console.log({ inN, outN });
