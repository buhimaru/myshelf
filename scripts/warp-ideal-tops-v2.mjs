import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;
const BODY_Y0 = 481;
const BODY_Y1 = 581;
const IDEAL_SPINE_L = 73;
const IDEAL_SPINE_R = 212;
const IDEAL_FRONT = 475;

function idx(x, y) {
  return (y * W + x) * 4;
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function get(d, x, y) {
  x = Math.max(0, Math.min(W - 1, Math.round(x)));
  y = Math.max(0, Math.min(H - 1, Math.round(y)));
  const i = idx(x, y);
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}
function set(d, x, y, r, g, b, a = 255) {
  const i = idx(x, y);
  d[i] = Math.max(0, Math.min(255, Math.round(r)));
  d[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
  d[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  d[i + 3] = a;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function sampleBilinear(d, x, y) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const tx = x - x0,
    ty = y - y0;
  const p00 = get(d, x0, y0);
  const p10 = get(d, x0 + 1, y0);
  const p01 = get(d, x0, y0 + 1);
  const p11 = get(d, x0 + 1, y0 + 1);
  return [
    lerp(lerp(p00[0], p10[0], tx), lerp(p01[0], p11[0], tx), ty),
    lerp(lerp(p00[1], p10[1], tx), lerp(p01[1], p11[1], tx), ty),
    lerp(lerp(p00[2], p10[2], tx), lerp(p01[2], p11[2], tx), ty),
  ];
}

const base = await sharp("public/images/ref/bg-before-softblur.png")
  .ensureAlpha()
  .raw()
  .toBuffer();
const ideal = await sharp("public/images/ref/ideal-normalized-918.png")
  .ensureAlpha()
  .raw()
  .toBuffer();
const d = Buffer.from(base);

function mapX(cx) {
  const t = (cx - SPINE_L) / (SPINE_R - SPINE_L);
  return IDEAL_SPINE_L + t * (IDEAL_SPINE_R - IDEAL_SPINE_L);
}

// Compress tops: only use 7px of ideal tops (IDEAL_FRONT-7 .. IDEAL_FRONT-1)
// mapped into curr BODY_Y0-7 .. BODY_Y0-1  (shorter visible depth)
const TOP_H = 7;

let cr = 0,
  cg = 0,
  cb = 0,
  cn = 0;
for (let y = 455; y <= 465; y++) {
  for (let x = IDEAL_SPINE_L; x <= IDEAL_SPINE_R + 12; x++) {
    const [r, g, b] = get(ideal, x, y);
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

for (let y = 450; y < BODY_Y0; y++) {
  for (let x = SPINE_L; x <= SPINE_R + 12; x++) set(d, x, y, cr, cg, cb);
}
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_R + 1; x <= SPINE_R + 12; x++) set(d, x, y, cr, cg, cb);
}

// Tops with vertical compression: sample ideal's near-front tops more densely
for (let k = 0; k < TOP_H; k++) {
  const y = BODY_Y0 - 1 - k;
  // Map k=0 → ideal just above front; stretch sampling toward front (lighter)
  // Use ideal rows IDEAL_FRONT-1-k*1.15 (compress deep dark parts)
  const iy = IDEAL_FRONT - 1 - k * 0.85;
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const [r, g, b] = sampleBilinear(ideal, mapX(x), iy);
    // Lighten tops slightly toward front color to reduce dark-lid feel
    const [fr, fg, fb] = get(base, x, BODY_Y0);
    const lift = 0.12 * (1 - k / TOP_H);
    set(
      d,
      x,
      y,
      lerp(r, fr, lift),
      lerp(g, fg, lift),
      lerp(b, fb, lift)
    );
  }
}

// Book5 side: stronger cavity pull, max 5px
for (let y = BODY_Y0 - TOP_H; y <= BODY_Y1; y++) {
  const iy = IDEAL_FRONT + (y - BODY_Y0); // body-aligned
  for (let dist = 1; dist <= 5; dist++) {
    const x = SPINE_R + dist;
    const [ir, ig, ib] = sampleBilinear(ideal, IDEAL_SPINE_R + dist, iy);
    // Stronger pull — side should be subdued
    const pull = 0.25 + dist * 0.12;
    set(
      d,
      x,
      y,
      lerp(ir, cr, Math.min(0.85, pull)),
      lerp(ig, cg, Math.min(0.85, pull)),
      lerp(ib, cb, Math.min(0.85, pull))
    );
  }
  for (let x = SPINE_R + 6; x <= SPINE_R + 12; x++) set(d, x, y, cr, cg, cb);
}

// Near tops, force side even thinner (2px)
for (let y = BODY_Y0 - TOP_H; y < BODY_Y0; y++) {
  for (let dist = 3; dist <= 5; dist++) {
    set(d, SPINE_R + dist, y, cr, cg, cb);
  }
  // soften dist 1-2 toward cavity
  for (let dist = 1; dist <= 2; dist++) {
    const [r, g, b] = get(d, SPINE_R + dist, y);
    const pull = 0.35 + dist * 0.2;
    set(d, SPINE_R + dist, y, lerp(r, cr, pull), lerp(g, cg, pull), lerp(b, cb, pull));
  }
}

// Restore front body
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const i = idx(x, y);
    d[i] = base[i];
    d[i + 1] = base[i + 1];
    d[i + 2] = base[i + 2];
    d[i + 3] = base[i + 3];
  }
}

// Crease blend
for (let x = SPINE_L; x <= SPINE_R; x++) {
  const y = BODY_Y0 - 1;
  const [fr, fg, fb] = get(base, x, BODY_Y0);
  const [tr, tg, tb] = get(d, x, y);
  set(d, x, y, lerp(tr, fr, 0.3), lerp(tg, fg, 0.3), lerp(tb, fb, 0.3));
}

// Soften TR corner without notch: fill from left/below
for (let y = BODY_Y0 - 3; y < BODY_Y0; y++) {
  for (let x = SPINE_R - 1; x <= SPINE_R + 2; x++) {
    if (x <= SPINE_R && y >= BODY_Y0) continue;
    const left = get(d, Math.max(SPINE_L, x - 1), y);
    const down = y + 1 >= BODY_Y0 && x <= SPINE_R ? get(base, x, BODY_Y0) : get(d, x, y + 1);
    const cur = get(d, x, y);
    // If too dark (notch), lift toward neighbors
    if (lum(cur[0], cur[1], cur[2]) < 40 && x <= SPINE_R) {
      set(
        d,
        x,
        y,
        (left[0] + down[0]) / 2,
        (left[1] + down[1]) / 2,
        (left[2] + down[2]) / 2
      );
    }
  }
}

let bodyCh = 0;
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const i = idx(x, y);
    if (d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2])
      bodyCh++;
  }
}
let outCh = 0,
  editCh = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const ch =
      d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2];
    if (!ch) continue;
    const allowed =
      (x >= SPINE_L && x <= SPINE_R && y >= 450 && y < BODY_Y0) ||
      (x >= SPINE_R + 1 && x <= SPINE_R + 12 && y >= 450 && y <= BODY_Y1);
    if (allowed) editCh++;
    else outCh++;
  }
}
console.log({ bodyCh, outCh, editCh });

const mid = [];
for (let y = 472; y <= 483; y++) {
  const [r, g, b] = get(d, 140, y);
  mid.push(`y${y}:${lum(r, g, b).toFixed(0)}`);
}
console.log("tops", mid.join(" "));
const side = [];
for (let x = 206; x <= 216; x++) {
  const [r, g, b] = get(d, x, 520);
  side.push(`x${x}:${lum(r, g, b).toFixed(0)}`);
}
console.log("side", side.join(" "));

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, "public/images/shelf-background.png");
console.log("wrote");
