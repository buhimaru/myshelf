import sharp from "sharp";

const src =
  "C:/Users/user/AppData/Local/Temp/cursor/screenshots/page-2026-10-20T11-54-42-079Z.png";
const page = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const w = page.info.width;
const ch = 4;
const lum = (x, y) => {
  const i = (y * w + x) * ch;
  return (page.data[i] + page.data[i + 1] + page.data[i + 2]) / 3;
};

const L = 207;
const R = 324;
let top = null;
let bot = null;
for (let y = 480; y < 700; y++) {
  let c = 0;
  for (let x = L; x <= R; x++) {
    const v = lum(x, y);
    if (v > 200 && v < 242) c++;
  }
  if (c > (R - L) * 0.55) {
    if (top == null) top = y;
    bot = y;
  }
}
console.log({ top, bot, h: bot - top + 1 });
console.log("above+top:");
for (let y = top - 22; y <= top + 8; y++) {
  const xs = [];
  for (let x = L; x <= R; x += 8) xs.push(lum(x, y) | 0);
  console.log(y, xs.join(","));
}

await sharp(src)
  .extract({ left: L - 20, top: top - 40, width: R - L + 60, height: 90 })
  .resize(500, 225, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/page-top-final-zoom.png");

const a = await sharp("public/images/ref/spine-top-after-repair.png")
  .resize(500, 200)
  .png()
  .toBuffer();
const p = await sharp("public/images/ref/page-top-final-zoom.png")
  .resize(500, 200)
  .png()
  .toBuffer();
const g = await sharp("public/images/ref/spine-top-goal-zoom.png")
  .resize(500, 200)
  .png()
  .toBuffer();
const lab = (t) =>
  Buffer.from(
    `<svg width="500" height="20"><text x="250" y="14" text-anchor="middle" fill="#fff" font-size="12">${t}</text></svg>`,
  );

await sharp({
  create: {
    width: 1520,
    height: 230,
    channels: 3,
    background: { r: 20, g: 20, b: 22 },
  },
})
  .composite([
    { input: lab("BG repaired"), left: 0, top: 2 },
    { input: lab("PAGE live"), left: 510, top: 2 },
    { input: lab("GOAL"), left: 1020, top: 2 },
    { input: a, left: 0, top: 24 },
    { input: p, left: 510, top: 24 },
    { input: g, left: 1020, top: 24 },
  ])
  .png()
  .toFile("public/images/ref/spine-top-final-compare.png");

console.log("wrote spine-top-final-compare.png");
