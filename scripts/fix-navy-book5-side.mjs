/**
 * 5巻右側面・接地影の再構築。
 *
 * 原因:
 *   ネイビー塗りで白背表紙の「極薄側面(209–211)→AA(212)→空洞」の相対輝度が潰れ、
 *   側面が空洞と同じ暗さ・寒色になり、黒い帯／足元のぬぼ／段差に見えた。
 *
 * 方針:
 *   白背表紙の側面幾何（相対フォールオフ）を、現行ネイビー正面色＋空洞色へ転写。
 *   正面(x<=208)・1–4巻・棚板木目・ライト・レコードは触れない。
 *
 * 出力:
 *   shelf-background-navy-leather-sidefix-after.png
 *   （complete / 本番は未更新。確認後に採用）
 */

import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;

const BEFORE = "public/images/shelf-background-navy-leather-sidefix-before.png";
const WHITE = "public/images/shelf-background-white-spines.png";
const AFTER = "public/images/shelf-background-navy-leather-sidefix-after.png";

const beforeBytes = fs.readFileSync(BEFORE);

const { data: navyData } = await sharp(BEFORE)
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
/** 寒色バイアスを少し戻し、革側面を暖色の棚影に馴染ませる */
function warmNavyEdge(rgb, amount) {
  const [r, g, b] = rgb;
  return [
    r + (Math.min(b, 40) - r) * amount * -0.15 + amount * 2,
    g + amount * 0.5,
    b - amount * 4,
  ];
}

const X0 = 209;
const X1 = 212; // inclusive: thin side + 1px AA only
const Y0 = 476;
const Y1 = 596;

const touched = new Set();

for (let y = Y0; y <= Y1; y++) {
  // 正面サンプル（変更禁止の列）。革の色・質感の基準。
  const faceN = get(base, 207, Math.min(Math.max(y, 482), 590));
  const faceW = get(whiteData, 207, Math.min(Math.max(y, 482), 590));
  const faceNL = Math.max(lum(...faceN), 1);
  const faceWL = Math.max(lum(...faceW), 1);

  // 空洞／棚の受け側。足元では棚の光をわずかに拾う。
  let cavY = Math.min(y, 580);
  let cav = get(base, 214, cavY);
  if (y >= 586 && y <= 595) {
    const shelf = get(base, 218, y);
    // 接触影: 空洞と棚の中間よりやや暗め（黒塗りにしない）
    cav = lerp3(cav, shelf, 0.22);
    cav = [cav[0] * 0.85, cav[1] * 0.85, cav[2] * 0.85];
  } else if (y >= 596) {
    // 接地行: 棚板色そのものへ寄せる（木目は既存ピクセルを優先し側面列だけ）
    cav = get(base, 214, y);
  }

  const cavW = get(whiteData, 214, Math.min(y, 580));
  const cavWL = Math.max(lum(...cavW), 1);
  const denom = Math.max(faceWL - cavWL, 1);

  for (let x = X0; x <= X1; x++) {
    const w = get(whiteData, x, y);
    const wL = lum(...w);

    // 白側面の相対位置: 0=正面側, 1=空洞側
    let t = (faceWL - wL) / denom;
    t = clamp(t, 0, 1);

    // 側面列は正面に近い薄い立体。AA列(x=212)だけ空洞寄り。
    // 白の実測に合わせ、209–211 は t を少し圧縮して「黒帯」を防ぐ。
    if (x <= 211) {
      t = Math.pow(t, 0.85) * 0.92;
    } else {
      // x=212: 白は中間AA。足元ではさらに柔らかい。
      if (y >= 586 && y <= 595) t = clamp(t * 0.72, 0, 0.78);
      else t = clamp(t, 0.55, 0.88);
    }

    let col = lerp3(faceN, cav, t);

    // 側面(209–211)は正面のネイビー色相を保ちつつ極薄の暗まり
    if (x <= 211) {
      const sideKeep = lerp3(faceN, col, 0.55 + (x - 209) * 0.12);
      col = sideKeep;
      col = warmNavyEdge(col, 0.35 + (x - 209) * 0.15);
      // 正面対比を保つ下限（空洞に飲み込まれない）
      const minL = faceNL * (x === 209 ? 0.78 : x === 210 ? 0.68 : 0.55);
      const cL = lum(...col);
      if (cL < minL) {
        const s = minL / Math.max(cL, 1);
        col = [col[0] * s, col[1] * s, col[2] * s];
      }
    } else {
      // AA: 空洞の暖色に寄せ、寒色の黒い縁を消す
      col = lerp3(col, cav, 0.35);
      col = warmNavyEdge(col, 0.55);
    }

    // TR付近: 上面との接合を滑らかに（正面は触らない）
    if (y < 482) {
      const topFace = get(base, 207, 479);
      const topBlend = clamp((482 - y) / 6, 0, 1);
      col = lerp3(col, lerp3(topFace, cav, 0.35 + (x - 209) * 0.15), topBlend * 0.45);
    }

    // 足元接地: 側面下端を棚へ自然に溶かす
    if (y >= 594) {
      const shelf = get(base, Math.min(x + 4, 220), Math.min(y + 2, 598));
      const footT = (y - 594) / 3;
      col = lerp3(col, lerp3(col, shelf, 0.55), footT);
    }

    const prev = get(out, x, y);
    if (
      Math.abs(prev[0] - col[0]) > 0.5 ||
      Math.abs(prev[1] - col[1]) > 0.5 ||
      Math.abs(prev[2] - col[2]) > 0.5
    ) {
      set(x, y, ...col);
      touched.add(`${x},${y}`);
    }
  }
}

// 差分ガード: 編集領域外は1pxも変えない
let outside = 0;
let diffN = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (
      out[i] === base[i] &&
      out[i + 1] === base[i + 1] &&
      out[i + 2] === base[i + 2]
    ) {
      continue;
    }
    diffN++;
    if (x < X0 || x > X1 || y < Y0 || y > Y1) outside++;
  }
}

if (outside > 0) {
  throw new Error(`Outside edit region changed: ${outside} px`);
}

const tmp = AFTER + ".tmp.png";
await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(tmp);
fs.renameSync(tmp, AFTER);

// BEFORE 不変確認
if (!beforeBytes.equals(fs.readFileSync(BEFORE))) {
  throw new Error("BEFORE backup was modified!");
}
// complete も不変（本番はまだ触らない）
const complete = fs.readFileSync(
  "public/images/shelf-background-navy-leather-complete.png"
);
if (!beforeBytes.equals(complete)) {
  console.warn("NOTE: complete differs from sidefix-before (unexpected)");
}

console.log({
  touched: touched.size,
  diffN,
  outside,
  region: { X0, X1, Y0, Y1 },
});

function row(buf, y) {
  const cells = [];
  for (let x = 206; x <= 214; x++) {
    cells.push(`${x}:${lum(...get(buf, x, y)) | 0}`);
  }
  return cells.join(" ");
}

for (const y of [478, 500, 520, 560, 585, 592, 595]) {
  console.log("before y" + y, row(base, y));
  console.log("after  y" + y, row(out, y));
}

// ズーム比較素材
const crops = [
  { name: "side-full", box: { left: 198, top: 470, width: 50, height: 140 }, scale: 10 },
  { name: "tr", box: { left: 198, top: 470, width: 50, height: 40 }, scale: 10 },
  { name: "foot", box: { left: 198, top: 575, width: 50, height: 35 }, scale: 10 },
];

for (const c of crops) {
  const bw = c.box.width * c.scale;
  const bh = c.box.height * c.scale;
  await sharp(BEFORE)
    .extract(c.box)
    .resize(bw, bh, { kernel: "nearest" })
    .toFile(`public/images/ref/navy-sidefix-before-${c.name}.png`);
  await sharp(AFTER)
    .extract(c.box)
    .resize(bw, bh, { kernel: "nearest" })
    .toFile(`public/images/ref/navy-sidefix-after-${c.name}.png`);

  const label = (t, w) =>
    Buffer.from(
      `<svg width="${w}" height="22"><text x="4" y="16" fill="#eee" font-size="12" font-family="Segoe UI,sans-serif">${t}</text></svg>`
    );
  const b = await sharp(`public/images/ref/navy-sidefix-before-${c.name}.png`)
    .png()
    .toBuffer();
  const a = await sharp(`public/images/ref/navy-sidefix-after-${c.name}.png`)
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: bw * 2 + 24,
      height: bh + 36,
      channels: 3,
      background: { r: 16, g: 16, b: 16 },
    },
  })
    .composite([
      { input: label(`BEFORE ${c.name}`, bw), top: 4, left: 8 },
      { input: label(`AFTER ${c.name}`, bw), top: 4, left: bw + 16 },
      { input: b, top: 28, left: 8 },
      { input: a, top: 28, left: bw + 16 },
    ])
    .png()
    .toFile(`public/images/ref/navy-sidefix-compare-${c.name}.png`);
}

console.log("done →", AFTER);
