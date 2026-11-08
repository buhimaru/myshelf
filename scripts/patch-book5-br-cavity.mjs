import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const SRC = "public/images/shelf-background.png";
const BEFORE = "public/images/ref/before-tr-br-local.png";

const { data } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: baseData } = await sharp(BEFORE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const d = Buffer.from(data);
const base = Buffer.from(baseData);

function idx(x, y) {
  return (y * W + x) * 4;
}
function get(buf, x, y) {
  const i = idx(x, y);
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function set(x, y, r, g, b) {
  const i = idx(x, y);
  d[i] = Math.round(r);
  d[i + 1] = Math.round(g);
  d[i + 2] = Math.round(b);
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Restore cavity right of side for y<=595
for (let y = 580; y <= 595; y++) {
  for (let x = 213; x <= 220; x++) {
    const i = idx(x, y);
    d[i] = base[i];
    d[i + 1] = base[i + 1];
    d[i + 2] = base[i + 2];
  }
}

const cavity = get(base, 214, 520);
for (let y = 580; y <= 595; y++) {
  const side = get(d, 211, y);
  const ideal = lerp3(side, cavity, 0.5);
  const cur = get(d, 212, y);
  if (lum(...cur) < lum(...ideal) - 3 || lum(...cur) > lum(...ideal) + 15) {
    set(212, y, ...lerp3(cur, ideal, 0.75));
  }
}

// Foot grounding only y596-597, x209-212
for (let y = 596; y <= 597; y++) {
  const shelf = get(base, 204, y);
  for (let x = 209; x <= 212; x++) {
    const cur = get(d, x, y);
    if (lum(...cur) < 50 || lum(...cur) > 160) {
      const sideCol = get(d, 211, 594);
      const t = Math.min(0.75, 0.4 + (x - 209) * 0.1 + (y - 596) * 0.15);
      set(x, y, ...lerp3(sideCol, shelf, t));
    }
  }
  for (let x = 213; x <= 214; x++) {
    const i = idx(x, y);
    const b = get(base, x, y);
    if (lum(...b) > 40) {
      d[i] = base[i];
      d[i + 1] = base[i + 1];
      d[i + 2] = base[i + 2];
    } else {
      const shelfR = get(base, 216, y);
      set(x, y, ...lerp3(b, shelfR, 0.35));
    }
  }
}

const row = (y) =>
  [209, 210, 211, 212, 213, 214]
    .map((x) => `${x}:${lum(...get(d, x, y)) | 0}`)
    .join(" ");
console.log("y590", row(590));
console.log("y595", row(595));
console.log("y596", row(596));

let front = 0;
for (let y = 481; y <= 595; y++) {
  for (let x = 72; x <= 208; x++) {
    const i = idx(x, y);
    if (d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2]) front++;
  }
}
console.log({ front });

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, SRC);

const brBox = { left: 200, top: 575, width: 28, height: 28 };
await sharp(BEFORE)
  .extract(brBox)
  .resize(336, 336, { kernel: "nearest" })
  .toFile("public/images/ref/fix-br-before.png");
await sharp(SRC)
  .extract(brBox)
  .resize(336, 336, { kernel: "nearest" })
  .toFile("public/images/ref/fix-br-after.png");

const label = (t, w) =>
  Buffer.from(
    `<svg width="${w}" height="22"><text x="4" y="16" fill="#eee" font-size="12" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );
const beforeBr = await sharp("public/images/ref/fix-br-before.png").png().toBuffer();
const afterBr = await sharp("public/images/ref/fix-br-after.png").png().toBuffer();
await sharp({
  create: { width: 700, height: 380, channels: 3, background: { r: 16, g: 16, b: 16 } },
})
  .composite([
    { input: label("BEFORE BR (blue)", 336), top: 4, left: 8 },
    { input: label("AFTER BR (blue)", 336), top: 4, left: 356 },
    { input: beforeBr, top: 28, left: 8 },
    { input: afterBr, top: 28, left: 356 },
  ])
  .png()
  .toFile("public/images/ref/fix-br-compare.png");

console.log("done");
