/**
 * 固定装飾ネイビー5冊の「分離試作」（局所上塗り禁止の代替）。
 *
 * 元素材調査:
 * - shelf-background.png === white-spines（本が焼き込み済み）
 * - shelf-empty-ref.jpg の「空の棚」も白背表紙5冊あり（作品なしの意）
 * → 真の「本なし棚」ソースは不在。空棚背景は隣接木目からの推定復元とする。
 *
 * 出力（いずれも新規。complete/v2/v3 は触らない）:
 * - public/images/prototypes/shelf-bg-nospines-estimate.png
 * - public/images/prototypes/navy-leather-spines-overlay.png
 * - public/images/ref/layered-spines-compare-*.png
 */

import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const COMPLETE =
  "public/images/shelf-background-navy-leather-complete.png";
const WHITE = "public/images/shelf-background-white-spines.png";
const TEX = "public/images/ref/leather-navy-texture.png";

const OUT_DIR = "public/images/prototypes";
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync("public/images/ref", { recursive: true });

const BG_OUT = `${OUT_DIR}/shelf-bg-nospines-estimate.png`;
const OVERLAY_OUT = `${OUT_DIR}/navy-leather-spines-overlay.png`;

const BOOKS = [
  { id: 0, x0: 72, x1: 98 },
  { id: 1, x0: 100, x1: 126 },
  { id: 2, x0: 128, x1: 154 },
  { id: 3, x0: 156, x1: 181 },
  { id: 4, x0: 183, x1: 208 }, // 正面のみ。側面は別途合成
];
const Y0 = 478;
const Y1 = 596;
const SIDE_X0 = 209;
const SIDE_X1 = 211; // 極薄側面（黒帯を含めない）

const { data: complete } = await sharp(COMPLETE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { data: white } = await sharp(WHITE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const texMeta = await sharp(TEX).metadata();
const { data: tex } = await sharp(TEX)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

function idx(x, y) {
  return (y * W + x) * 4;
}
function get(buf, x, y) {
  const i = idx(x, y);
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}
function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerp3(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}
function texAt(u, v) {
  const x = ((Math.floor(u) % texMeta.width) + texMeta.width) % texMeta.width;
  const y = ((Math.floor(v) % texMeta.height) + texMeta.height) % texMeta.height;
  const i = (y * texMeta.width + x) * 4;
  return tex[i] / 255;
}

const completeBytes = fs.readFileSync(COMPLETE);

// ─── 1) 推定・本なし背景 ───
// 白版で「本」だった画素を、右の空洞木目＋棚板からクローン復元（破壊的加工は別ファイルのみ）
const bg = Buffer.from(complete);

function isSpineMask(x, y) {
  if (y < Y0 - 8 || y > Y1 + 2) return false;
  if (x < 70 || x > 214) return false;
  const [r, g, b] = get(white, x, y);
  const L = lum(r, g, b);
  // 白背表紙・上面・薄い側面
  return L > 45;
}

for (let y = Y0 - 8; y <= Y1 + 2; y++) {
  for (let x = 70; x <= 214; x++) {
    if (!isSpineMask(x, y)) continue;

    // 参照: 右側の空洞木目（本の外側）を水平にサンプリング
    const srcX = clamp(220 + ((x - 70) % 18), 218, 268);
    let [sr, sg, sb] = get(complete, srcX, y);

    // 足元は棚板の木目を混ぜる
    if (y >= 592) {
      const shelf = get(complete, clamp(x + 40, 220, 300), Math.min(y + 2, 600));
      const t = clamp((y - 592) / 6, 0, 1);
      [sr, sg, sb] = lerp3([sr, sg, sb], shelf, t * 0.85);
    }
    // 上面付近は空洞の暗さを保つ
    if (y < 485) {
      const cav = get(complete, 230, Math.min(y + 20, 520));
      [sr, sg, sb] = lerp3([sr, sg, sb], cav, 0.35);
    }

    // 微ノイズでべた塗り感を抑える
    const n = ((x * 12 + y * 7) % 5) - 2;
    const i = idx(x, y);
    bg[i] = clamp(sr + n, 0, 255);
    bg[i + 1] = clamp(sg + n * 0.6, 0, 255);
    bg[i + 2] = clamp(sb + n * 0.3, 0, 255);
  }
}

await sharp(bg, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(BG_OUT);

// ─── 2) 透明オーバーレイ（5冊） ───
const overlay = Buffer.alloc(W * H * 4, 0);

function paintNavyFace(x, y, bookId) {
  const face = get(complete, clamp(x, BOOKS[bookId].x0, BOOKS[bookId].x1), y);
  // complete の正面色を主に（1–4・5正面の質感維持）
  let [r, g, b] = face;
  // 数字ゴースト低減: 極端に明るい画素は周囲ネイビーへ
  if (lum(r, g, b) > 55) {
    const ref = get(complete, BOOKS[bookId].x0 + 4, clamp(y, 500, 560));
    [r, g, b] = lerp3([r, g, b], ref, 0.7);
  }
  return [r, g, b];
}

function paintThinSide(y) {
  // 正面右端色を少し暗くした薄い厚み。空洞へ落とさない。
  const face = get(complete, 206, clamp(y, 482, 590));
  const t = texAt(xSideTex(y), y * 0.42);
  const shade = 0.78 + t * 0.08;
  return [
    face[0] * shade * 0.95,
    face[1] * shade * 0.98,
    face[2] * shade * 0.92,
  ];
}
function xSideTex(y) {
  return 40 + y * 0.15;
}

for (let y = Y0; y <= Y1; y++) {
  for (const book of BOOKS) {
    for (let x = book.x0; x <= book.x1; x++) {
      // 白マスクで外形（隙間は透明のまま）
      const wL = lum(...get(white, x, y));
      if (wL < 50 && y >= 482) continue;
      const [r, g, b] = paintNavyFace(x, y, book.id);
      let a = 255;
      if (y < 482) a = Math.round(clamp((wL - 40) / 80, 0.35, 1) * 255);
      if (y >= 595) a = Math.round(255 * (1 - (y - 595) / 3));
      const i = idx(x, y);
      overlay[i] = r;
      overlay[i + 1] = g;
      overlay[i + 2] = b;
      overlay[i + 3] = a;
    }
  }

  // 5冊目の極薄側面（黒帯なし・暖色寄り）
  if (y >= 482 && y <= 595) {
    for (let x = SIDE_X0; x <= SIDE_X1; x++) {
      const side = paintThinSide(y);
      const edgeT = (x - SIDE_X0) / (SIDE_X1 - SIDE_X0 + 1);
      const dark = lerp3(side, [side[0] * 0.85, side[1] * 0.85, side[2] * 0.82], edgeT);
      let a = Math.round(230 - edgeT * 70);
      if (y >= 593) a = Math.round(a * (1 - (y - 593) / 4));
      const i = idx(x, y);
      overlay[i] = dark[0];
      overlay[i + 1] = dark[1];
      overlay[i + 2] = dark[2];
      overlay[i + 3] = a;
    }
  }
}

// 冊間の細い隙間（白版のギャップ列）をわずかに暗く残す／透明でOK
// → ギャップはマスク外なので透明のまま（背景の推定木目が見える）

await sharp(overlay, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(OVERLAY_OUT);

if (!completeBytes.equals(fs.readFileSync(COMPLETE))) {
  throw new Error("complete was modified!");
}

console.log({
  BG_OUT,
  OVERLAY_OUT,
  note: "empty shelf is ESTIMATED (no book-free source existed)",
});

// 比較用クロップ
const crops = [
  { name: "shelf", box: { left: 55, top: 455, width: 200, height: 160 }, s: 3 },
  { name: "edge", box: { left: 195, top: 475, width: 70, height: 130 }, s: 7 },
  { name: "foot", box: { left: 195, top: 575, width: 70, height: 35 }, s: 8 },
];

async function composeLayeredPreview() {
  // 背景＋オーバーレイを合成した確認用（プレビューと同ロジックの静的版）
  return sharp(BG_OUT)
    .composite([{ input: OVERLAY_OUT, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

const layeredFull = await composeLayeredPreview();
await sharp(layeredFull).toFile(`${OUT_DIR}/layered-composite-preview.png`);

for (const c of crops) {
  const pw = c.box.width * c.s;
  const ph = c.box.height * c.s;
  const a = await sharp(COMPLETE)
    .extract(c.box)
    .resize(pw, ph, { kernel: c.box.width > 100 ? "lanczos3" : "nearest" })
    .png()
    .toBuffer();
  const b = await sharp(layeredFull)
    .extract(c.box)
    .resize(pw, ph, { kernel: c.box.width > 100 ? "lanczos3" : "nearest" })
    .png()
    .toBuffer();
  const lab = (t) =>
    Buffer.from(
      `<svg width="${pw}" height="26"><text x="6" y="18" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
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
      { input: lab(`採用版 ${c.name}`), top: 4, left: 8 },
      { input: lab(`分離試作 ${c.name}`), top: 4, left: pw + 20 },
      { input: a, top: 30, left: 8 },
      { input: b, top: 30, left: pw + 20 },
    ])
    .png()
    .toFile(`public/images/ref/layered-spines-compare-${c.name}.png`);
}

console.log("compare images → public/images/ref/layered-spines-compare-*.png");
