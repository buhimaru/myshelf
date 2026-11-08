/**
 * LEDの発光だけを右へ動かすプレビュー。
 * 採用中の背景ファイルは読まない・上書きしない。
 * 空棚と採用背景の発光部は同一なので、空棚上で光を分離し、
 * 変わった画素だけをプレビュー用の複製へ写す。
 *
 * 分離:
 * - 棚板下の溝にある発光芯は、未点灯の溝の色を残して芯の画素だけを平行移動する。
 * - 背板の光だまりは、行の未点灯色との差をぼかした低周波だけを移動し、木目は残す。
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const EMPTY = "public/images/prototypes/shelf-empty-candidate-1024x664.png";
const OUT_DIR = "public/images/prototypes/led-shift";
const SHIFTS = [0, 15, 30, 45];
const W = 1024;
const H = 664;
const SLOT_Y0 = 165;
const SLOT_Y1 = 174;
const GLOW_X0 = 720;
const GLOW_X1 = 900;
const GLOW_Y0 = 175;
const GLOW_Y1 = 245;

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function unlitRow(data, y) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let x = 400; x <= 680; x++) {
    const i = (y * W + x) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  }
  return [median(rs), median(gs), median(bs)];
}

async function blurRaw(raw) {
  return sharp(raw, { raw: { width: W, height: H, channels: 4 } })
    .blur(8)
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/** 右隅が自然に暗い分。LEDのない下の方の行から取る */
function vignetteCurve(data) {
  const curve = new Array(W).fill(1);
  const samples = [];
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = 278; y <= 292; y++) {
      const i = (y * W + x) * 4;
      s += lum(data[i], data[i + 1], data[i + 2]);
    }
    samples.push(s / 15);
  }
  const base = median(samples.slice(400, 681));
  for (let x = 0; x < W; x++) {
    curve[x] = Math.min(1.2, Math.max(0.35, samples[x] / base));
  }
  return curve;
}

function buildField(data, unlit) {
  const slot = Buffer.alloc(W * H * 4);
  const glow = Buffer.alloc(W * H * 4);
  for (let y = SLOT_Y0; y <= SLOT_Y1; y++) {
    const [ur, ug, ub] = unlit[y];
    for (let x = GLOW_X0; x <= GLOW_X1; x++) {
      const i = (y * W + x) * 4;
      const er = data[i] - ur;
      const eg = data[i + 1] - ug;
      const eb = data[i + 2] - ub;
      if (lum(Math.max(0, er), Math.max(0, eg), Math.max(0, eb)) < 30) continue;
      slot[i] = Math.max(0, er);
      slot[i + 1] = Math.max(0, eg);
      slot[i + 2] = Math.max(0, eb);
      slot[i + 3] = 255;
    }
  }
  for (let y = GLOW_Y0; y <= GLOW_Y1; y++) {
    const [ur, ug, ub] = unlit[y];
    for (let x = GLOW_X0; x <= GLOW_X1; x++) {
      const i = (y * W + x) * 4;
      glow[i] = Math.max(0, data[i] - ur);
      glow[i + 1] = Math.max(0, data[i + 1] - ug);
      glow[i + 2] = Math.max(0, data[i + 2] - ub);
      glow[i + 3] = 255;
    }
  }
  return { slot, glow };
}

function shiftBuffer(src, dx) {
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const srcX = x - dx;
      if (srcX < 0 || srcX >= W) continue;
      const di = (y * W + x) * 4;
      const si = (y * W + srcX) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

function apply(base, field, dx) {
  const moved = shiftBuffer(field, dx);
  const out = Buffer.from(base);
  let changed = 0;
  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    let pixelChanged = false;
    for (let c = 0; c < 3; c++) {
      const next = Math.max(0, Math.min(255, base[p + c] - field[p + c] + moved[p + c]));
      if (next !== base[p + c]) pixelChanged = true;
      out[p + c] = next;
    }
    if (pixelChanged) changed++;
  }
  return { out, changed };
}

function barStats(data) {
  let minX = W;
  let maxX = 0;
  let sum = 0;
  let n = 0;
  for (let y = SLOT_Y0; y <= SLOT_Y1; y++) {
    for (let x = 700; x < 1000; x++) {
      const i = (y * W + x) * 4;
      if (lum(data[i], data[i + 1], data[i + 2]) > 180) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        sum += x;
        n++;
      }
    }
  }
  let minL = 999;
  let minAt = 900;
  for (let x = 890; x <= 980; x++) {
    const i = (170 * W + x) * 4;
    const value = lum(data[i], data[i + 1], data[i + 2]);
    if (value < minL) {
      minL = value;
      minAt = x;
    }
  }
  let stile = null;
  for (let x = minAt; x < W; x++) {
    const i = (170 * W + x) * 4;
    if (lum(data[i], data[i + 1], data[i + 2]) > 40) {
      stile = x;
      break;
    }
  }
  return {
    minX: n ? minX : null,
    maxX: n ? maxX : null,
    center: n ? sum / n : null,
    stile,
    gap: n && stile != null ? stile - maxX : null,
  };
}

const empty = await sharp(EMPTY).ensureAlpha().raw().toBuffer();
const unlit = [];
for (let y = 0; y < H; y++) unlit.push(unlitRow(empty, y));
const vignette = vignetteCurve(empty);
const localMean = await blurRaw(empty);
const { slot } = buildField(empty, unlit);
const field = Buffer.from(slot);
for (let y = GLOW_Y0; y <= GLOW_Y1; y++) {
  const [ur, ug, ub] = unlit[y];
  for (let x = 640; x <= 970; x++) {
    const i = (y * W + x) * 4;
    const v = vignette[x];
    const er = localMean[i] - ur * v;
    const eg = localMean[i + 1] - ug * v;
    const eb = localMean[i + 2] - ub * v;
    if (er <= 0 && eg <= 0 && eb <= 0) continue;
    const capR = Math.max(0, empty[i] - ur * v);
    const capG = Math.max(0, empty[i + 1] - ug * v);
    const capB = Math.max(0, empty[i + 2] - ub * v);
    field[i] = Math.min(Math.max(0, er), capR);
    field[i + 1] = Math.min(Math.max(0, eg), capG);
    field[i + 2] = Math.min(Math.max(0, eb), capB);
    field[i + 3] = 255;
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const stileFixed = barStats(empty).stile;

for (const dx of SHIFTS) {
  const { out, changed } = apply(empty, field, dx);
  const bar = barStats(out);
  bar.stile = stileFixed;
  bar.gap = bar.maxX == null ? null : stileFixed - bar.maxX;
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(path.join(OUT_DIR, `empty-led-dx${dx}.png`));
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: 700, top: 145, width: 310, height: 130 })
    .resize(930, 390, { kernel: "nearest" })
    .png()
    .toFile(path.join(OUT_DIR, `zoom-dx${dx}.png`));
  console.log(
    `dx${dx}`,
    "changedPx",
    changed,
    "bar",
    `${bar.minX}-${bar.maxX}`,
    "center",
    bar.center?.toFixed(1),
    "stile",
    bar.stile,
    "gap",
    bar.gap
  );
}

const adoptedPath = "public/images/shelf-background-navy-leather-newbooks.png";
const adoptedBefore = fs.statSync(adoptedPath);
const adopted = await sharp(adoptedPath).ensureAlpha().raw().toBuffer();

for (const dx of SHIFTS) {
  if (dx === 0) continue;
  const shifted = await sharp(path.join(OUT_DIR, `empty-led-dx${dx}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const merged = Buffer.from(adopted);
  let copied = 0;
  let blocked = 0;
  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    let differs = false;
    for (let c = 0; c < 3; c++) {
      if (shifted[p + c] !== empty[p + c]) differs = true;
    }
    if (!differs) continue;
    let sameBase = true;
    for (let c = 0; c < 3; c++) {
      if (adopted[p + c] !== empty[p + c]) sameBase = false;
    }
    if (!sameBase) {
      blocked++;
      continue;
    }
    merged[p] = shifted[p];
    merged[p + 1] = shifted[p + 1];
    merged[p + 2] = shifted[p + 2];
    merged[p + 3] = 255;
    copied++;
  }
  await sharp(merged, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(path.join(OUT_DIR, `shelf-dx${dx}.png`));
  console.log(`shelf-dx${dx}`, "copied", copied, "blocked", blocked);
}

const adoptedAfter = fs.statSync(adoptedPath);
console.log(
  "adopted unchanged",
  adoptedBefore.size === adoptedAfter.size &&
    adoptedBefore.mtimeMs === adoptedAfter.mtimeMs,
  adoptedAfter.size,
  adoptedAfter.mtime.toISOString()
);
