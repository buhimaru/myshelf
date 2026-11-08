import sharp from "sharp";
import fs from "fs";

const goalSrc =
  "C:/Users/user/.cursor/projects/c-Users-user-Desktop-myshelf/assets/c__Users_user_AppData_Roaming_Cursor_User_workspaceStorage_51f75e25082b29e8ee12fbb4300782fc_images_______________-b17647e4-939e-4793-bc28-b6ab83f46c9d.jpg";

fs.copyFileSync(goalSrc, "public/images/ref/goal-latest.jpg");

const before = await sharp("public/images/ref/bg-before-spine-fix.png")
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const after = await sharp("public/images/shelf-background.png")
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const goalRaw = await sharp(goalSrc)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

console.log("sizes", {
  before: before.info,
  after: after.info,
  goal: goalRaw.info,
});

function shelfBBox(data, info) {
  const w = info.width;
  const h = info.height;
  const ch = 4;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum < 245) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const bbB = shelfBBox(before.data, before.info);
const bbG = shelfBBox(goalRaw.data, goalRaw.info);
console.log({ bbB, bbG });

const W = 1024;
const H = 664;

async function normalizeToBg(srcPath, bb) {
  const extracted = await sharp(srcPath)
    .extract({ left: bb.minX, top: bb.minY, width: bb.w, height: bb.h })
    .resize(bbB.w, bbB.h, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: extracted, left: bbB.minX, top: bbB.minY }])
    .png()
    .toBuffer();
}

const beforeN = await sharp("public/images/ref/bg-before-spine-fix.png")
  .resize(W, H, { fit: "fill" })
  .png()
  .toBuffer();
const afterN = await sharp("public/images/shelf-background.png")
  .resize(W, H, { fit: "fill" })
  .png()
  .toBuffer();
const goalN = await normalizeToBg(goalSrc, bbG);
fs.writeFileSync("public/images/ref/goal-normalized.png", goalN);

const gn = await sharp(goalN)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const an = await sharp(afterN)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const bn = await sharp(beforeN)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

function measureSpines(data, info, label) {
  const w = info.width;
  const ch = 4;
  const lum = (x, y) => {
    const i = (y * w + x) * ch;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
  let t = null;
  let b = null;
  let L = 999;
  let R = 0;
  for (let y = 440; y < 620; y++) {
    for (let x = 55; x < 230; x++) {
      const Lval = lum(x, y);
      if (Lval > 200 && Lval < 247) {
        if (t == null) t = y;
        b = y;
        L = Math.min(L, x);
        R = Math.max(R, x);
      }
    }
  }
  console.log(label, { t, b, h: b - t + 1, L, R, w: R - L + 1 });
  return { t, b, h: b - t + 1, L, R, w: R - L + 1 };
}

const mBefore = measureSpines(bn.data, bn.info, "before");
const mAfter = measureSpines(an.data, an.info, "after");
const mGoal = measureSpines(gn.data, gn.info, "goalN");

const crop = { left: 50, top: 430, width: 220, height: 190 };
const cBefore = await sharp(beforeN).extract(crop).png().toBuffer();
const cAfter = await sharp(afterN).extract(crop).png().toBuffer();
const cGoal = await sharp(goalN).extract(crop).png().toBuffer();
const labelH = 28;
const canvasW = 220 * 3 + 16;
const canvasH = 190 + labelH + 10;
const svg = (t) =>
  Buffer.from(
    `<svg width="220" height="${labelH}"><text x="110" y="18" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif">${t}</text></svg>`,
  );

await sharp({
  create: {
    width: canvasW,
    height: canvasH,
    channels: 3,
    background: { r: 25, g: 25, b: 28 },
  },
})
  .composite([
    { input: svg("BEFORE"), left: 0, top: 4 },
    { input: svg("AFTER"), left: 228, top: 4 },
    { input: svg("GOAL"), left: 456, top: 4 },
    { input: cBefore, left: 0, top: labelH },
    { input: cAfter, left: 228, top: labelH },
    { input: cGoal, left: 456, top: labelH },
  ])
  .png()
  .toFile("public/images/ref/compare-before-after-goal.png");

// Diff after vs goal in spine region only (for shape check)
const gw = gn.info.width;
const ch = 4;
let spineDiffSum = 0;
let spineDiffN = 0;
for (let y = 457; y <= 595; y++) {
  for (let x = 72; x <= 208; x++) {
    const i = (y * gw + x) * ch;
    const d =
      Math.abs(an.data[i] - gn.data[i]) +
      Math.abs(an.data[i + 1] - gn.data[i + 1]) +
      Math.abs(an.data[i + 2] - gn.data[i + 2]);
    spineDiffSum += d;
    spineDiffN++;
  }
}
console.log({
  meanSpineDiffAfterVsGoal: spineDiffSum / spineDiffN / 3,
  meanSpineDiffBeforeVsGoal: (() => {
    let s = 0;
    let n = 0;
    for (let y = 457; y <= 595; y++) {
      for (let x = 72; x <= 208; x++) {
        const i = (y * gw + x) * ch;
        s +=
          Math.abs(bn.data[i] - gn.data[i]) +
          Math.abs(bn.data[i + 1] - gn.data[i + 1]) +
          Math.abs(bn.data[i + 2] - gn.data[i + 2]);
        n++;
      }
    }
    return s / n / 3;
  })(),
  measurements: { mBefore, mAfter, mGoal },
});

console.log("wrote compare-before-after-goal.png");
