import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;
const BODY_Y0 = 481;
const BODY_Y1 = 581;

function idx(x, y) {
  return (y * W + x) * 4;
}

const base = await sharp("public/images/ref/bg-before-softblur.png")
  .ensureAlpha()
  .raw()
  .toBuffer();
const cur = await sharp("public/images/shelf-background.png")
  .ensureAlpha()
  .raw()
  .toBuffer();
const out = Buffer.from(cur);

let restored = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const allowed =
      (x >= SPINE_L && x <= SPINE_R && y >= 450 && y < BODY_Y0) ||
      (x >= SPINE_R + 1 && x <= SPINE_R + 16 && y >= 450 && y <= BODY_Y1);
    if (allowed) continue;
    const i = idx(x, y);
    if (
      out[i] !== base[i] ||
      out[i + 1] !== base[i + 1] ||
      out[i + 2] !== base[i + 2]
    ) {
      out[i] = base[i];
      out[i + 1] = base[i + 1];
      out[i + 2] = base[i + 2];
      out[i + 3] = base[i + 3];
      restored++;
    }
  }
}

let bodyCh = 0;
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const i = idx(x, y);
    if (
      out[i] !== base[i] ||
      out[i + 1] !== base[i + 1] ||
      out[i + 2] !== base[i + 2]
    )
      bodyCh++;
  }
}

let outCh = 0;
let editCh = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const changed =
      out[i] !== base[i] ||
      out[i + 1] !== base[i + 1] ||
      out[i + 2] !== base[i + 2];
    if (!changed) continue;
    const allowed =
      (x >= SPINE_L && x <= SPINE_R && y >= 450 && y < BODY_Y0) ||
      (x >= SPINE_R + 1 && x <= SPINE_R + 16 && y >= 450 && y <= BODY_Y1);
    if (allowed) editCh++;
    else outCh++;
  }
}
console.log({ restored, bodyCh, outCh, editCh });

const tmp = "public/images/shelf-background.tmp.png";
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, "public/images/shelf-background.png");

const crop = (path, left, top, w, h, rw, rh) =>
  sharp(path)
    .extract({ left, top, width: w, height: h })
    .resize(rw, rh, { kernel: "lanczos3" })
    .png()
    .toBuffer();

const afterTops = await crop(
  "public/images/shelf-background.png",
  60,
  467,
  180,
  36,
  540,
  108
);
const idealTops = await crop(
  "public/images/ref/ideal-normalized-918.png",
  60,
  461,
  180,
  36,
  540,
  108
);
const afterB5 = await crop(
  "public/images/shelf-background.png",
  178,
  461,
  70,
  55,
  280,
  220
);
const idealB5 = await crop(
  "public/images/ref/ideal-normalized-918.png",
  182,
  455,
  70,
  55,
  280,
  220
);

await sharp(afterTops).toFile("public/images/ref/cmp-tone-after-tops.png");
await sharp(idealTops).toFile("public/images/ref/cmp-tone-ideal-tops.png");
await sharp(afterB5).toFile("public/images/ref/cmp-tone-after-book5.png");
await sharp(idealB5).toFile("public/images/ref/cmp-tone-ideal-book5.png");

const label = (t, w) =>
  Buffer.from(
    `<svg width="${w}" height="24"><text x="6" y="17" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );

await sharp({
  create: {
    width: 1120,
    height: 150,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
})
  .composite([
    { input: label("AFTER tops", 540), top: 2, left: 10 },
    { input: label("IDEAL tops", 540), top: 2, left: 570 },
    { input: afterTops, top: 28, left: 10 },
    { input: idealTops, top: 28, left: 570 },
  ])
  .png()
  .toFile("public/images/ref/final-after-vs-ideal-tops.png");

await sharp({
  create: {
    width: 580,
    height: 250,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
})
  .composite([
    { input: label("AFTER book5", 280), top: 2, left: 5 },
    { input: label("IDEAL book5", 280), top: 2, left: 295 },
    { input: afterB5, top: 28, left: 5 },
    { input: idealB5, top: 28, left: 295 },
  ])
  .png()
  .toFile("public/images/ref/final-after-vs-ideal-book5.png");

const ab = await crop(
  "public/images/shelf-background.png",
  55,
  455,
  190,
  150,
  380,
  300
);
const ib = await crop(
  "public/images/ref/ideal-normalized-918.png",
  55,
  449,
  190,
  150,
  380,
  300
);
await sharp({
  create: {
    width: 780,
    height: 340,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
})
  .composite([
    { input: label("AFTER spines", 380), top: 4, left: 5 },
    { input: label("IDEAL spines", 380), top: 4, left: 395 },
    { input: ab, top: 30, left: 5 },
    { input: ib, top: 30, left: 395 },
  ])
  .png()
  .toFile("public/images/ref/final-after-vs-ideal-spines.png");

console.log("compares ok");
