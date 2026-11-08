import sharp from "sharp";
import fs from "fs";

/**
 * No region blur. Thin light tops + short soft book5 side.
 * Ideal character without muddy edges.
 */

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;
const BODY_Y0 = 481;
const BODY_Y1 = 581;

// Thin & light — tip almost white, quick soft fade (ideal pale tops)
const TOP_RAMP = [205, 185, 155, 115, 70, 35];
// Short soft side — no thick panel
const SIDE_RAMP = [200, 150, 95, 50];

function idx(x, y) {
  return (y * W + x) * 4;
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function get(d, x, y) {
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

const basePath = "public/images/ref/bg-before-softblur.png";
const { data: raw } = await sharp(basePath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const d = Buffer.from(raw);
const base = Buffer.from(raw);

let cr = 0,
  cg = 0,
  cb = 0,
  cn = 0;
for (let y = 450; y <= 462; y++) {
  for (let x = SPINE_L; x <= SPINE_R + 16; x++) {
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

// Clear tops + side
for (let y = 450; y < BODY_Y0; y++) {
  for (let x = SPINE_L; x <= SPINE_R + 16; x++) set(d, x, y, cr, cg, cb);
}
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_R + 1; x <= SPINE_R + 16; x++) set(d, x, y, cr, cg, cb);
}

const gutters = new Set([99, 126, 154, 181]);

for (let x = SPINE_L; x <= SPINE_R; x++) {
  const [fr, fg, fb] = get(base, x, BODY_Y0);
  const fL = Math.max(1, lum(fr, fg, fb));
  const g = gutters.has(x);
  for (let k = 0; k < TOP_RAMP.length; k++) {
    const y = BODY_Y0 - 1 - k;
    let targetL = TOP_RAMP[k];
    if (g) targetL = lerp(targetL, cL, 0.35);
    const t = Math.max(0, Math.min(1, (fL - targetL) / (fL - cL)));
    set(d, x, y, lerp(fr, cr, t), lerp(fg, cg, t), lerp(fb, cb, t));
  }
}

// 1px horizontal soften tops only
{
  const s = Buffer.from(d);
  for (let y = BODY_Y0 - TOP_RAMP.length; y < BODY_Y0; y++) {
    for (let x = SPINE_L + 1; x < SPINE_R; x++) {
      if (gutters.has(x)) continue;
      const a = get(d, x - 1, y);
      const b = get(d, x, y);
      const c = get(d, x + 1, y);
      set(
        s,
        x,
        y,
        a[0] * 0.15 + b[0] * 0.7 + c[0] * 0.15,
        a[1] * 0.15 + b[1] * 0.7 + c[1] * 0.15,
        a[2] * 0.15 + b[2] * 0.7 + c[2] * 0.15
      );
    }
  }
  s.copy(d);
}

// Book5 side — shorter near tops to avoid flare
for (let y = BODY_Y0 - TOP_RAMP.length; y <= BODY_Y1; y++) {
  const [er, eg, eb] =
    y >= BODY_Y0 ? get(base, SPINE_R, y) : get(d, SPINE_R, y);
  const eL = Math.max(1, lum(er, eg, eb));
  const maxDist = y < BODY_Y0 ? 3 : SIDE_RAMP.length;
  for (let dist = 1; dist <= maxDist; dist++) {
    const x = SPINE_R + dist;
    let targetL = SIDE_RAMP[Math.min(dist - 1, SIDE_RAMP.length - 1)];
    if (y < BODY_Y0) targetL = lerp(targetL, cL, 0.35 + dist * 0.15);
    const t = Math.max(0, Math.min(1, (eL - targetL) / (eL - cL)));
    set(d, x, y, lerp(er, cr, t), lerp(eg, cg, t), lerp(eb, cb, t));
  }
  for (let x = SPINE_R + maxDist + 1; x <= SPINE_R + 16; x++) {
    set(d, x, y, cr, cg, cb);
  }
}

// Soften only TR corner 2x2 average (not front body)
for (let y = BODY_Y0 - 3; y <= BODY_Y0 + 1; y++) {
  for (let x = SPINE_R; x <= SPINE_R + 3; x++) {
    if (y >= BODY_Y0 && x <= SPINE_R) continue;
    let rs = 0,
      gs = 0,
      bs = 0,
      n = 0;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const xx = x + dx,
          yy = y + dy;
        let p;
        if (yy >= BODY_Y0 && xx <= SPINE_R) p = get(base, xx, yy);
        else p = get(d, xx, yy);
        rs += p[0];
        gs += p[1];
        bs += p[2];
        n++;
      }
    }
    set(d, x, y, rs / n, gs / n, bs / n);
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
      (x >= SPINE_R + 1 && x <= SPINE_R + 16 && y >= 450 && y <= BODY_Y1);
    if (allowed) editCh++;
    else outCh++;
  }
}
console.log({ bodyCh, outCh, editCh });

const mid = [];
for (let y = 473; y <= 483; y++) {
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
