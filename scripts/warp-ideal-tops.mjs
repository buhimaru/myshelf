import sharp from "sharp";
import fs from "fs";

/**
 * Map ideal tops/side onto current spine fronts.
 * Ideal frontTop≈475, spineR≈212 → curr frontTop=481, spineR=208
 * dx≈-1..-4, dy≈+6
 */

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;
const BODY_Y0 = 481;
const BODY_Y1 = 581;
const DY = 6; // curr_y = ideal_y + DY
const IDEAL_SPINE_L = 73;
const IDEAL_SPINE_R = 212;

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
  const x1 = x0 + 1,
    y1 = y0 + 1;
  const tx = x - x0,
    ty = y - y0;
  const p00 = get(d, x0, y0);
  const p10 = get(d, x1, y0);
  const p01 = get(d, x0, y1);
  const p11 = get(d, x1, y1);
  const r =
    lerp(lerp(p00[0], p10[0], tx), lerp(p01[0], p11[0], tx), ty);
  const g =
    lerp(lerp(p00[1], p10[1], tx), lerp(p01[1], p11[1], tx), ty);
  const b =
    lerp(lerp(p00[2], p10[2], tx), lerp(p01[2], p11[2], tx), ty);
  return [r, g, b];
}

const basePath = "public/images/ref/bg-before-softblur.png";
const idealPath = "public/images/ref/ideal-normalized-918.png";

const base = await sharp(basePath).ensureAlpha().raw().toBuffer();
const ideal = await sharp(idealPath).ensureAlpha().raw().toBuffer();
const d = Buffer.from(base);

// Map x: curr [SPINE_L, SPINE_R] → ideal [IDEAL_SPINE_L, IDEAL_SPINE_R]
function mapX(cx) {
  const t = (cx - SPINE_L) / (SPINE_R - SPINE_L);
  return IDEAL_SPINE_L + t * (IDEAL_SPINE_R - IDEAL_SPINE_L);
}

// Cavity from ideal above spines
let cr = 0,
  cg = 0,
  cb = 0,
  cn = 0;
for (let y = 455; y <= 465; y++) {
  for (let x = IDEAL_SPINE_L; x <= IDEAL_SPINE_R + 10; x++) {
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

// Clear tops + side on curr
for (let y = 450; y < BODY_Y0; y++) {
  for (let x = SPINE_L; x <= SPINE_R + 14; x++) set(d, x, y, cr, cg, cb);
}
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_R + 1; x <= SPINE_R + 14; x++) set(d, x, y, cr, cg, cb);
}

// Copy tops: y in [BODY_Y0-12, BODY_Y0)
for (let y = BODY_Y0 - 12; y < BODY_Y0; y++) {
  const iy = y - DY;
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const ix = mapX(x);
    const [r, g, b] = sampleBilinear(ideal, ix, iy);
    set(d, x, y, r, g, b);
  }
}

// Book5 right side: map curr x>SPINE_R to ideal x>IDEAL_SPINE_R
for (let y = BODY_Y0 - 12; y <= BODY_Y1; y++) {
  const iy = y - DY;
  for (let dist = 1; dist <= 10; dist++) {
    const x = SPINE_R + dist;
    const ix = IDEAL_SPINE_R + dist;
    // Soften: pull toward cavity slightly to reduce protrusion vs ideal
    const [ir, ig, ib] = sampleBilinear(ideal, ix, iy);
    const pull = Math.min(0.35, dist * 0.04);
    set(
      d,
      x,
      y,
      lerp(ir, cr, pull),
      lerp(ig, cg, pull),
      lerp(ib, cb, pull)
    );
  }
  for (let x = SPINE_R + 11; x <= SPINE_R + 14; x++) set(d, x, y, cr, cg, cb);
}

// Ensure front body untouched
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const i = idx(x, y);
    d[i] = base[i];
    d[i + 1] = base[i + 1];
    d[i + 2] = base[i + 2];
    d[i + 3] = base[i + 3];
  }
}

// Soft blend 1 row at crease toward front to avoid hard seam
for (let x = SPINE_L; x <= SPINE_R; x++) {
  const y = BODY_Y0 - 1;
  const [fr, fg, fb] = get(base, x, BODY_Y0);
  const [tr, tg, tb] = get(d, x, y);
  set(d, x, y, lerp(tr, fr, 0.25), lerp(tg, fg, 0.25), lerp(tb, fb, 0.25));
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
      (x >= SPINE_R + 1 && x <= SPINE_R + 14 && y >= 450 && y <= BODY_Y1);
    if (allowed) editCh++;
    else outCh++;
  }
}
console.log({ bodyCh, outCh, editCh });

const mid = [];
for (let y = 470; y <= 483; y++) {
  const [r, g, b] = get(d, 140, y);
  mid.push(`y${y}:${lum(r, g, b).toFixed(0)}`);
}
console.log("tops", mid.join(" "));
const side = [];
for (let x = 205; x <= 220; x++) {
  const [r, g, b] = get(d, x, 520);
  side.push(`x${x}:${lum(r, g, b).toFixed(0)}`);
}
console.log("side", side.join(" "));

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, "public/images/shelf-background.png");
console.log("wrote");
