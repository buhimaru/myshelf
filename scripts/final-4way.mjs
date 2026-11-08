import sharp from "sharp";

const pageSrc =
  "C:/Users/user/AppData/Local/Temp/cursor/screenshots/page-2026-10-20T11-31-41-715Z.png";

await sharp(pageSrc)
  .extract({ left: 240, top: 430, width: 320, height: 200 })
  .png()
  .toFile("public/images/ref/page-bay4-left.png");

const W = 280;
const H = 175;
const resize = (p) => sharp(p).resize(W, H).png().toBuffer();
const [before, after, page, goal] = await Promise.all([
  resize("public/images/ref/compare-spine-before.png"),
  resize("public/images/ref/compare-spine-after.png"),
  resize("public/images/ref/page-bay4-left.png"),
  resize("public/images/ref/compare-spine-goal.png"),
]);

const lab = (t) =>
  Buffer.from(
    `<svg width="${W}" height="22"><text x="${W / 2}" y="15" text-anchor="middle" fill="#fff" font-size="12" font-family="sans-serif">${t}</text></svg>`,
  );

await sharp({
  create: {
    width: W * 4 + 30,
    height: H + 30,
    channels: 3,
    background: { r: 22, g: 22, b: 24 },
  },
})
  .composite([
    { input: lab("BEFORE"), left: 0, top: 2 },
    { input: lab("AFTER"), left: W + 10, top: 2 },
    { input: lab("PAGE"), left: (W + 10) * 2, top: 2 },
    { input: lab("GOAL"), left: (W + 10) * 3, top: 2 },
    { input: before, left: 0, top: 26 },
    { input: after, left: W + 10, top: 26 },
    { input: page, left: (W + 10) * 2, top: 26 },
    { input: goal, left: (W + 10) * 3, top: 26 },
  ])
  .png()
  .toFile("public/images/ref/final-compare-4way.png");

console.log("wrote final-compare-4way.png");
