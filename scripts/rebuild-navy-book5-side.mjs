/**
 * 5冊目右側面の再構築（継ぎ足し禁止・幾何転写）。
 *
 * 原因:
 *   白版は x209–211 が正面より暗いが明確な薄側面、x212 が空洞への AA。
 *   ネイビー採用版では同列が空洞輝度まで潰れ寒色化し、黒い縦帯／塊に見えた。
 *
 * 方針:
 *   complete を入力に、白版の相対フォールオフで側面を一括再構築。
 *   正面 x<=208・1–4冊・棚・空洞木目(x>=213 本体)は触らない。
 *   complete は上書きしない。
 *
 * 出力: public/images/shelf-background-navy-leather-book5side-v2.png
 */

import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const SRC = "public/images/shelf-background-navy-leather-complete.png";
const WHITE = "public/images/shelf-background-white-spines.png";
const OUT = "public/images/shelf-background-navy-leather-book5side-v2.png";

const srcBytes = fs.readFileSync(SRC);

const { data: navyData } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { data: whiteData } = await sharp(WHITE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const out = Buffer.from(navyData);
const base = Buffer.from(navyData);

function idx(x, y) {
  return (y * W + x) * 4;
}
function get(buf, x, y) {
  const i = idx(x, y);
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function set(x, y, r, g, b) {
  const i = idx(x, y);
  out[i] = Math.round(clamp(r, 0, 255));
  out[i + 1] = Math.round(clamp(g, 0, 255));
  out[i + 2] = Math.round(clamp(b, 0, 255));
}
function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
/** 寒色帯を抑え、革側面を暖色の棚影に馴染ませる */
function toSideNavy(face, darken) {
  const L = lum(...face);
  const target = L * darken;
  const scale = target / Math.max(L, 1);
  let r = face[0] * scale;
  let g = face[1] * scale;
  let b = face[2] * scale;
  // 青寄りを少し戻す（黒い帯の原因だった cool を緩和）
  const cool = Math.max(0, b - Math.max(r, g));
  b -= cool * 0.55;
  r += cool * 0.12;
  g += cool * 0.08;
  return [r, g, b];
}

// 編集領域: 5冊目の薄側面＋AAのみ
const X0 = 209;
const X1 = 212;
const Y0 = 476;
const Y1 = 596;

for (let y = Y0; y <= Y1; y++) {
  // 正面サンプル（非編集）。質感・色の基準。
  const faceY = clamp(y, 482, 590);
  const face = get(base, 207, faceY);
  const faceW = get(whiteData, 207, faceY);
  const faceWL = Math.max(lum(...faceW), 1);

  // 空洞は暖色の木（既存 complete の x214）。足元は棚の光をわずかに拾う。
  let cav = get(base, 214, Math.min(y, 580));
  if (y >= 586 && y <= 595) {
    const shelf = get(base, 218, y);
    cav = lerp3(cav, shelf, 0.18);
    cav = [cav[0] * 0.9, cav[1] * 0.9, cav[2] * 0.9];
  } else if (y >= 596) {
    cav = get(base, 214, y);
  }

  const cavW = get(whiteData, 214, Math.min(y, 580));
  const cavWL = Math.max(lum(...cavW), 1);
  const denom = Math.max(faceWL - cavWL, 1);

  // 白版相対位置から、側面の「暗さ段階」を決める
  // 理想: ごく薄い側面 = 正面より少し暗いネイビー ×2px + 1px AA
  const sideCols = {
    209: toSideNavy(face, 0.86),
    210: toSideNavy(face, 0.74),
    211: toSideNavy(face, 0.62),
  };

  for (let x = X0; x <= X1; x++) {
    const w = get(whiteData, x, y);
    const wL = lum(...w);
    // 白のフォールオフ位置 0=正面側 1=空洞側
    let t = clamp((faceWL - wL) / denom, 0, 1);

    let col;
    if (x <= 211) {
      // 薄側面: 白の相対で側面段階を補間しつつ、空洞には落とさない
      const baseSide = sideCols[x];
      // 白が明るいほど正面寄り、暗いほど側面寄り（ただし下限は側面色）
      const towardFace = clamp(1 - t * 1.15, 0, 1);
      col = lerp3(baseSide, face, towardFace * 0.25);
      // TR: 上面接合
      if (y < 482) {
        const top = get(base, 207, 479);
        col = lerp3(col, toSideNavy(top, 0.7 + (x - 209) * 0.08), (482 - y) / 6);
      }
    } else {
      // x=212: AA。白の t に沿い側面→空洞。寒色黒帯にしない。
      const edge = sideCols[211];
      let aaT = clamp(t, 0.5, 0.9);
      if (y >= 586 && y <= 595) aaT = clamp(t * 0.65, 0.35, 0.7); // 足元で柔らかく
      col = lerp3(edge, cav, aaT);
    }

    // 接地: 側面下端を棚へ溶かす（黒ぬぼ禁止）
    if (y >= 594) {
      const shelf = get(base, Math.min(220, x + 6), Math.min(598, y + 1));
      const ft = (y - 594) / 3;
      col = lerp3(col, lerp3(col, shelf, 0.4), ft);
    }

    set(x, y, ...col);
  }
}

// ガード: 編集外ゼロ差分、complete 不変
let outside = 0;
let diffN = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (
      out[i] === base[i] &&
      out[i + 1] === base[i + 1] &&
      out[i + 2] === base[i + 2]
    )
      continue;
    diffN++;
    if (x < X0 || x > X1 || y < Y0 || y > Y1) outside++;
  }
}
if (outside > 0) throw new Error("outside edit region: " + outside);
if (!srcBytes.equals(fs.readFileSync(SRC))) {
  throw new Error("complete was modified!");
}

const tmp = OUT + ".tmp.png";
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, OUT);

console.log({ out: OUT, diffN, outside, region: { X0, X1, Y0, Y1 } });

function row(buf, y) {
  return Array.from({ length: 9 }, (_, i) => {
    const x = 206 + i;
    return `${x}:${Math.round(lum(...get(buf, x, y)))}`;
  }).join(" ");
}
for (const y of [478, 520, 585, 592, 595]) {
  console.log("before y" + y, row(base, y));
  console.log("after  y" + y, row(out, y));
}

// 比較画像（拡大）と全体
const crops = [
  { name: "edge", box: { left: 195, top: 468, width: 55, height: 140 }, s: 8 },
  { name: "foot", box: { left: 195, top: 572, width: 55, height: 40 }, s: 10 },
  { name: "tr", box: { left: 195, top: 468, width: 55, height: 45 }, s: 10 },
];
for (const c of crops) {
  const bw = c.box.width * c.s;
  const bh = c.box.height * c.s;
  const b = await sharp(SRC)
    .extract(c.box)
    .resize(bw, bh, { kernel: "nearest" })
    .png()
    .toBuffer();
  const a = await sharp(OUT)
    .extract(c.box)
    .resize(bw, bh, { kernel: "nearest" })
    .png()
    .toBuffer();
  const label = (t, w) =>
    Buffer.from(
      `<svg width="${w}" height="24"><text x="6" y="17" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
    );
  await sharp({
    create: {
      width: bw * 2 + 28,
      height: bh + 40,
      channels: 3,
      background: { r: 18, g: 18, b: 18 },
    },
  })
    .composite([
      { input: label(`BEFORE ${c.name} (adopted)`, bw), top: 6, left: 8 },
      { input: label(`AFTER ${c.name} (v2 preview)`, bw), top: 6, left: bw + 20 },
      { input: b, top: 32, left: 8 },
      { input: a, top: 32, left: bw + 20 },
    ])
    .png()
    .toFile(`public/images/ref/book5side-v2-compare-${c.name}.png`);
}

// 全体通常サイズ（棚ブロック）
await sharp(SRC)
  .extract({ left: 55, top: 455, width: 200, height: 160 })
  .resize(600, 480, { kernel: "lanczos3" })
  .toFile("public/images/ref/book5side-v2-before-shelf.png");
await sharp(OUT)
  .extract({ left: 55, top: 455, width: 200, height: 160 })
  .resize(600, 480, { kernel: "lanczos3" })
  .toFile("public/images/ref/book5side-v2-after-shelf.png");

const sb = await sharp("public/images/ref/book5side-v2-before-shelf.png").png().toBuffer();
const sa = await sharp("public/images/ref/book5side-v2-after-shelf.png").png().toBuffer();
const lab = (t) =>
  Buffer.from(
    `<svg width="600" height="24"><text x="8" y="17" fill="#eee" font-size="14" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );
await sharp({
  create: { width: 1228, height: 520, channels: 3, background: { r: 18, g: 18, b: 18 } },
})
  .composite([
    { input: lab("BEFORE adopted complete"), top: 6, left: 8 },
    { input: lab("AFTER book5side-v2 (preview only)"), top: 6, left: 620 },
    { input: sb, top: 32, left: 8 },
    { input: sa, top: 32, left: 620 },
  ])
  .png()
  .toFile("public/images/ref/book5side-v2-compare-shelf.png");

console.log("compares → public/images/ref/book5side-v2-compare-*.png");
