/**
 * 新素材の紺色革装5冊を透明PNG切り抜き → 新空棚に配置する試作。
 * complete.png は変更しない。
 */

import sharp from "sharp";
import fs from "fs";

const SRC = "public/images/prototypes/navy-leather-5books-source.jpg";
const EMPTY = "public/images/prototypes/shelf-empty-candidate-1024x664.png";
const ADOPTED = "public/images/shelf-background-navy-leather-complete.png";
const OUT_DIR = "public/images/prototypes";

const CUTOUT = `${OUT_DIR}/navy-leather-5books-cutout.png`;
const PLACED = `${OUT_DIR}/navy-leather-5books-placed-1024x664.png`;
const COMPOSITE = `${OUT_DIR}/layered-newempty-newbooks-composite.png`;

const completeBytes = fs.readFileSync(ADOPTED);

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

function get(x, y) {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}
function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function isWood(r, g, b) {
  return r - b > 14 && r > g - 5 && lum(r, g, b) > 38;
}
function isGoldBand(r, g, b) {
  const L = lum(r, g, b);
  return r > 85 && g > 65 && b < 75 && L < 130 && r >= g;
}
function isNavyCore(r, g, b) {
  const L = lum(r, g, b);
  if (L < 8 || L > 72) return false;
  if (isWood(r, g, b)) return false;
  if (b + 5 >= r && b + 8 >= g && L < 68) return true;
  if (Math.abs(r - g) < 14 && Math.abs(g - b) < 20 && L < 42 && r < 52) return true;
  return false;
}

// ROI: 画像左〜中央（本がある領域）に限定
const ROI = { x0: 40, x1: 620, y0: 60, y1: 580 };

const core = new Uint8Array(W * H);
for (let y = ROI.y0; y <= ROI.y1; y++) {
  for (let x = ROI.x0; x <= ROI.x1; x++) {
    const c = get(x, y);
    if (isNavyCore(...c) || isGoldBand(...c)) core[y * W + x] = 1;
  }
}

// 冊間の暗い線を本側に含める（クローズは軽め）
function dilate(src, times) {
  let cur = Uint8Array.from(src);
  for (let t = 0; t < times; t++) {
    const next = new Uint8Array(cur);
    for (let y = ROI.y0; y <= ROI.y1; y++) {
      for (let x = ROI.x0; x <= ROI.x1; x++) {
        if (!cur[y * W + x]) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < ROI.x0 || ny < ROI.y0 || nx > ROI.x1 || ny > ROI.y1) continue;
            const [r, g, b] = get(nx, ny);
            // 木へは広げない。暗い隙間・紺のみ
            if (isWood(r, g, b) && lum(r, g, b) > 45) continue;
            next[ny * W + nx] = 1;
          }
      }
    }
    cur = next;
  }
  return cur;
}
let m = dilate(core, 2);

// シード: ROI中央付近の紺画素から連結成分
let seed = -1;
for (let y = 200; y < 400 && seed < 0; y++) {
  for (let x = 150; x < 400; x++) {
    if (m[y * W + x] && isNavyCore(...get(x, y))) {
      seed = y * W + x;
      break;
    }
  }
}
if (seed < 0) throw new Error("no seed in books");

const visited = new Uint8Array(W * H);
const stack = [seed];
const comp = [];
visited[seed] = 1;
while (stack.length) {
  const p = stack.pop();
  comp.push(p);
  const cx = p % W;
  const cy = (p / W) | 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx,
        ny = cy + dy;
      if (nx < ROI.x0 || ny < ROI.y0 || nx > ROI.x1 || ny > ROI.y1) continue;
      const ni = ny * W + nx;
      if (!m[ni] || visited[ni]) continue;
      visited[ni] = 1;
      stack.push(ni);
    }
  }
}
m = new Uint8Array(W * H);
for (const p of comp) m[p] = 1;
console.log("component", comp.length, "seed", seed % W, (seed / W) | 0);

// 外周の木を削る
for (let iter = 0; iter < 4; iter++) {
  const next = new Uint8Array(m);
  for (let y = ROI.y0; y <= ROI.y1; y++) {
    for (let x = ROI.x0; x <= ROI.x1; x++) {
      if (!m[y * W + x]) continue;
      let border = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (!m[(y + dy) * W + (x + dx)]) border = true;
      if (!border) continue;
      const [r, g, b] = get(x, y);
      if (isWood(r, g, b)) next[y * W + x] = 0;
    }
  }
  m = next;
}

let minX = W,
  minY = H,
  maxX = 0,
  maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
}
console.log({ minX, maxX, minY, maxY, cw: maxX - minX + 1, ch: maxY - minY + 1 });

const cw = maxX - minX + 1;
const ch = maxY - minY + 1;
const cut = Buffer.alloc(cw * ch * 4, 0);
for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {
    const i = ((y - minY) * cw + (x - minX)) * 4;
    const [r, g, b] = get(x, y);
    const on = m[y * W + x];
    let a = 0;
    if (on && !isWood(r, g, b)) a = 255;
    else if (!on) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          n += m[yy * W + xx];
        }
      if (n >= 3 && !isWood(r, g, b) && lum(r, g, b) < 65) a = Math.round((n / 9) * 190);
    }
    if (!a) continue;
    cut[i] = r;
    cut[i + 1] = g;
    cut[i + 2] = b;
    cut[i + 3] = a;
  }
}

await sharp(cut, { raw: { width: cw, height: ch, channels: 4 } }).png().toFile(CUTOUT);

// 採用版固定装飾に幅合わせ・下端接地
const TARGET = { x: 70, y: 476, w: 148, h: 122 };
let scale = TARGET.w / cw;
if (ch * scale > TARGET.h) scale = TARGET.h / ch;
const dw = Math.round(cw * scale);
const dh = Math.round(ch * scale);
const placeX = TARGET.x;
const placeY = TARGET.y + TARGET.h - dh;

const resized = await sharp(CUTOUT)
  .resize(dw, dh, { fit: "fill", kernel: "lanczos3" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const placed = Buffer.alloc(1024 * 664 * 4, 0);
const { data: rd, info: ri } = resized;
function pidx(x, y) {
  return (y * 1024 + x) * 4;
}

for (let x = 0; x < ri.width; x++) {
  let bottom = -1;
  for (let y = ri.height - 1; y >= 0; y--) {
    if (rd[(y * ri.width + x) * 4 + 3] > 120) {
      bottom = y;
      break;
    }
  }
  if (bottom < 0) continue;
  for (let dy = 1; dy <= 3; dy++) {
    const gx = placeX + x + 1;
    const gy = placeY + bottom + dy;
    if (gx < 0 || gy < 0 || gx >= 1024 || gy >= 664) continue;
    const pi = pidx(gx, gy);
    placed[pi] = 18;
    placed[pi + 1] = 10;
    placed[pi + 2] = 5;
    placed[pi + 3] = Math.max(placed[pi + 3], Math.round(45 * (1 - (dy - 1) / 3)));
  }
}

for (let y = 0; y < ri.height; y++) {
  for (let x = 0; x < ri.width; x++) {
    const ai = (y * ri.width + x) * 4;
    const a = rd[ai + 3];
    if (!a) continue;
    const px = placeX + x;
    const py = placeY + y;
    if (px < 0 || py < 0 || px >= 1024 || py >= 664) continue;
    const pi = pidx(px, py);
    const sa = a / 255;
    const da = placed[pi + 3] / 255;
    const outA = sa + da * (1 - sa);
    placed[pi] = Math.round((rd[ai] * sa + placed[pi] * da * (1 - sa)) / outA);
    placed[pi + 1] = Math.round(
      (rd[ai + 1] * sa + placed[pi + 1] * da * (1 - sa)) / outA
    );
    placed[pi + 2] = Math.round(
      (rd[ai + 2] * sa + placed[pi + 2] * da * (1 - sa)) / outA
    );
    placed[pi + 3] = Math.round(outA * 255);
  }
}

await sharp(placed, { raw: { width: 1024, height: 664, channels: 4 } }).png().toFile(PLACED);
await sharp(EMPTY).composite([{ input: PLACED, top: 0, left: 0 }]).png().toFile(COMPOSITE);

if (!completeBytes.equals(fs.readFileSync(ADOPTED))) throw new Error("complete modified");

console.log({ placeX, placeY, dw, dh, scale: +scale.toFixed(3) });

async function pair(name, box, scaleN) {
  const pw = box.width * scaleN;
  const ph = box.height * scaleN;
  const a = await sharp(ADOPTED).extract(box).resize(pw, ph).png().toBuffer();
  const b = await sharp(COMPOSITE).extract(box).resize(pw, ph).png().toBuffer();
  const lab = (t) =>
    Buffer.from(
      `<svg width="${pw}" height="24"><text x="6" y="17" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
    );
  await sharp({
    create: {
      width: pw * 2 + 28,
      height: ph + 40,
      channels: 3,
      background: { r: 16, g: 16, b: 16 },
    },
  })
    .composite([
      { input: lab(`採用版 ${name}`), top: 4, left: 8 },
      { input: lab(`新素材5冊 ${name}`), top: 4, left: pw + 20 },
      { input: a, top: 30, left: 8 },
      { input: b, top: 30, left: pw + 20 },
    ])
    .png()
    .toFile(`public/images/ref/newbooks-layered-compare-${name}.png`);
}

await pair("shelf", { left: 55, top: 455, width: 220, height: 160 }, 3);
await pair("edge", { left: 195, top: 475, width: 70, height: 130 }, 7);
await pair("foot", { left: 195, top: 575, width: 70, height: 35 }, 8);
await sharp(CUTOUT)
  .flatten({ background: { r: 90, g: 75, b: 60 } })
  .resize({ width: 420 })
  .toFile("public/images/ref/newbooks-cutout-preview.png");
console.log("done");
