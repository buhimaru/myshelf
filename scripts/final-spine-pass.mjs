import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;
const BODY_Y0 = 481;
const BODY_Y1 = 581;
const BASE = "public/images/ref/bg-before-book5-tops.png";

function idx(x, y) {
  return (y * W + x) * 4;
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function get(buf, x, y) {
  const i = idx(x, y);
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function set(d, x, y, r, g, b) {
  const i = idx(x, y);
  d[i] = Math.round(r);
  d[i + 1] = Math.round(g);
  d[i + 2] = Math.round(b);
  d[i + 3] = 255;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function inEdit(x, y) {
  return (
    (x >= SPINE_L && x <= SPINE_R && y >= 450 && y < BODY_Y0) ||
    (x >= SPINE_R + 1 && x <= SPINE_R + 12 && y >= 450 && y <= BODY_Y1)
  );
}
function inBody(x, y) {
  return x >= SPINE_L && x <= SPINE_R && y >= BODY_Y0 && y <= BODY_Y1;
}

const base = await sharp(BASE).ensureAlpha().raw().toBuffer();
const d = Buffer.from(base);

let cr = 0,
  cg = 0,
  cb = 0,
  cn = 0;
for (let y = 450; y <= 462; y++) {
  for (let x = SPINE_L; x <= SPINE_R + 12; x++) {
    const [r, g, b] = get(d, x, y);
    if (lum(r, g, b) < 55) {
      cr += r;
      cg += g;
      cb += b;
      cn++;
    }
  }
}
cr /= cn;
cg /= cn;
cb /= cn;
const cL = lum(cr, cg, cb);

for (let y = 450; y < BODY_Y0; y++) {
  for (let x = SPINE_L; x <= SPINE_R + 12; x++) set(d, x, y, cr, cg, cb);
}
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_R + 1; x <= SPINE_R + 12; x++) set(d, x, y, cr, cg, cb);
}

const RAMP = [208, 192, 168, 138, 105, 72, 42, 24];
const gutters = new Set([99, 126, 154, 181]);
for (let x = SPINE_L; x <= SPINE_R; x++) {
  const front = get(base, x, BODY_Y0);
  const fL = Math.max(1, lum(...front));
  for (let k = 0; k < RAMP.length; k++) {
    const y = BODY_Y0 - 1 - k;
    let tL = RAMP[k];
    if (gutters.has(x)) tL = lerp(tL, cL, 0.25);
    const t = Math.max(0, Math.min(1, (fL - tL) / (fL - cL)));
    set(d, x, y, lerp(front[0], cr, t), lerp(front[1], cg, t), lerp(front[2], cb, t));
  }
}

const s = Buffer.from(d);
for (let y = BODY_Y0 - RAMP.length; y < BODY_Y0; y++) {
  for (let x = SPINE_L + 1; x < SPINE_R; x++) {
    if (gutters.has(x)) continue;
    const a = get(d, x - 1, y);
    const b = get(d, x, y);
    const c = get(d, x + 1, y);
    const i = idx(x, y);
    s[i] = a[0] * 0.12 + b[0] * 0.76 + c[0] * 0.12;
    s[i + 1] = a[1] * 0.12 + b[1] * 0.76 + c[1] * 0.12;
    s[i + 2] = a[2] * 0.12 + b[2] * 0.76 + c[2] * 0.12;
  }
}
s.copy(d);

for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  const [er, eg, eb] = get(base, SPINE_R, y);
  const eL = Math.max(1, lum(er, eg, eb));
  const SIDE = [145, 85, 40];
  for (let dist = 1; dist <= 3; dist++) {
    const t = Math.max(0, Math.min(1, (eL - SIDE[dist - 1]) / (eL - cL)));
    set(d, SPINE_R + dist, y, lerp(er, cr, t), lerp(eg, cg, t), lerp(eb, cb, t));
  }
}
for (let y = BODY_Y0 - RAMP.length; y < BODY_Y0; y++) {
  const [er, eg, eb] = get(d, SPINE_R, y);
  const eL = Math.max(1, lum(er, eg, eb));
  for (let dist = 1; dist <= 2; dist++) {
    const tL = dist === 1 ? 110 : 45;
    const t = Math.max(0, Math.min(1, (eL - tL) / (eL - cL)));
    set(d, SPINE_R + dist, y, lerp(er, cr, t), lerp(eg, cg, t), lerp(eb, cb, t));
  }
}

for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const i = idx(x, y);
    d[i] = base[i];
    d[i + 1] = base[i + 1];
    d[i + 2] = base[i + 2];
    d[i + 3] = base[i + 3];
  }
}

let bodyCh = 0,
  outCh = 0,
  editCh = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const ch =
      d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2];
    if (!ch) continue;
    if (inBody(x, y)) bodyCh++;
    else if (inEdit(x, y)) editCh++;
    else outCh++;
  }
}
console.log({ bodyCh, outCh, editCh, base: BASE });

const mid = [];
for (let y = 472; y <= 483; y++) {
  const [r, g, b] = get(d, 140, y);
  mid.push(`y${y}:${lum(r, g, b).toFixed(0)}`);
}
console.log("tops", mid.join(" "));
const side = [];
for (let x = 206; x <= 214; x++) {
  const [r, g, b] = get(d, x, 520);
  side.push(`x${x}:${lum(r, g, b).toFixed(0)}`);
}
console.log("side", side.join(" "));

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
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

console.log("compares written");
