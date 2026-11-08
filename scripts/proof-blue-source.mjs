import sharp from "sharp";

const bgOnly = await sharp("public/images/shelf-background.png")
  .extract({ left: 195, top: 560, width: 60, height: 50 })
  .resize(480, 400, { kernel: "nearest" })
  .png()
  .toBuffer();

const coverRaw = await sharp("public/images/ref/slamdunk-cover.jpg")
  .resize(110, 110, { fit: "cover" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const bgFull = await sharp("public/images/shelf-background.png")
  .ensureAlpha()
  .raw()
  .toBuffer();
const canvas = Buffer.from(bgFull);
const W = 1024;
const cW = 110;
for (let y = 0; y < 110; y++) {
  for (let x = 0; x < 110; x++) {
    const ci = (y * cW + x) * 4;
    const dx = 228 + x;
    const dy = 482 + y;
    const di = (dy * W + dx) * 4;
    canvas[di] = coverRaw.data[ci];
    canvas[di + 1] = coverRaw.data[ci + 1];
    canvas[di + 2] = coverRaw.data[ci + 2];
    canvas[di + 3] = 255;
  }
}

const withCover = await sharp(canvas, {
  raw: { width: 1024, height: 664, channels: 4 },
})
  .extract({ left: 195, top: 560, width: 60, height: 50 })
  .resize(480, 400, { kernel: "nearest" })
  .png()
  .toBuffer();

function countBlue(buf) {
  let n = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i],
      g = buf[i + 1],
      b = buf[i + 2];
    if (b > 100 && r < 100 && b > r + 40) n++;
  }
  return n;
}

const bgZ = await sharp(bgOnly).raw().toBuffer();
const cvZ = await sharp(withCover).raw().toBuffer();
console.log({
  blueInBgOnly: countBlue(bgZ),
  blueWithCover: countBlue(cvZ),
});

await sharp(bgOnly).toFile("public/images/ref/proof-bg-only.png");
await sharp(withCover).toFile("public/images/ref/proof-with-cover.png");

const label = (t) =>
  Buffer.from(
    `<svg width="480" height="28"><text x="8" y="20" fill="#eee" font-size="14" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );

await sharp({
  create: {
    width: 980,
    height: 450,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
})
  .composite([
    {
      input: label("A: 背景のみ（青い三角形なし）"),
      top: 6,
      left: 10,
    },
    {
      input: label("B: 背景+スラムダンク表紙（青三角=表紙）"),
      top: 6,
      left: 500,
    },
    { input: bgOnly, top: 40, left: 10 },
    { input: withCover, top: 40, left: 500 },
  ])
  .png()
  .toFile("public/images/ref/proof-blue-is-cover.png");

console.log("wrote proof-blue-is-cover.png");
