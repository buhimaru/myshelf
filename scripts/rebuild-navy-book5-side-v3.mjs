/**
 * 5冊目右側面 + 棚奥の黒い縦線対策（v3）
 *
 * 調査結果:
 * - complete と white の差分はほぼ x209–212 のみ（棚奥 x213+ は同一）
 * - 黒い縦線の主因は (1) 寒色化した側面/AA が空洞と同化した「厚い黒帯」
 *   (2) 寒色AAと暖色空洞の硬すぎる境界が二重線に見えること
 * - 棚奥を茶色べた塗りせず、白版のフォールオフ + 既存暖色空洞で輪郭外を軟接合
 *
 * 出力: shelf-background-navy-leather-book5side-v3.png
 * complete / v2 は上書きしない
 */

import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const SRC = "public/images/shelf-background-navy-leather-complete.png";
const WHITE = "public/images/shelf-background-white-spines.png";
const OUT = "public/images/shelf-background-navy-leather-book5side-v3.png";

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
function sideNavy(face, amount) {
  // amount: 0=face, 1=かなり暗い側面。寒色帯を作らない。
  const dark = lerp3(face, [face[0] * 0.45, face[1] * 0.5, face[2] * 0.55], amount);
  const cool = Math.max(0, dark[2] - Math.max(dark[0], dark[1]));
  return [dark[0] + cool * 0.15, dark[1] + cool * 0.1, dark[2] - cool * 0.65];
}

/** 編集範囲: 輪郭(209–211) + 外側接合(212–216)。無制限に広げない */
const X0 = 209;
const X1 = 216;
const Y0 = 476;
const Y1 = 596;

for (let y = Y0; y <= Y1; y++) {
  const faceY = clamp(y, 482, 590);
  const face = get(base, 207, faceY);
  const faceW = get(whiteData, 207, faceY);
  const faceWL = Math.max(lum(...faceW), 1);

  // 既存の暖色空洞（塗りつぶし禁止の参照）
  const cavCore = get(base, 218, Math.min(y, 575));
  const cavNear = get(base, 214, Math.min(y, 575));
  const woodRef = get(base, 226, Math.min(y, 575)); // 少し手前の木目参照

  let cav = cavNear;
  if (y >= 586 && y <= 595) {
    const shelf = get(base, 220, y);
    cav = lerp3(cavNear, shelf, 0.2);
    cav = [cav[0] * 0.92, cav[1] * 0.92, cav[2] * 0.92];
  } else if (y >= 596) {
    cav = get(base, 214, y);
  }

  const cavW = get(whiteData, 214, Math.min(y, 575));
  const cavWL = Math.max(lum(...cavW), 1);
  const denom = Math.max(faceWL - cavWL, 1);

  // 白版の x212 AA 色（暖色みのある中間）を相対ヒントに
  const whiteAa = get(whiteData, 212, Math.min(Math.max(y, 482), 590));

  for (let x = X0; x <= X1; x++) {
    const wPix = get(whiteData, x, Math.min(y, 596));
    const wL = lum(...wPix);
    const t = clamp((faceWL - wL) / denom, 0, 1); // 0正面〜1空洞

    let col;

    if (x <= 210) {
      // 薄い右側面（正面より少し暗いネイビー）
      const amt = x === 209 ? 0.28 : 0.42;
      col = sideNavy(face, amt);
      if (y < 482) {
        const top = get(base, 207, 479);
        col = lerp3(col, sideNavy(top, amt), (482 - y) / 6);
      }
    } else if (x === 211) {
      // 輪郭の最終1px
      col = sideNavy(face, 0.55);
      // 白の相対でわずかに空洞へ
      col = lerp3(col, cav, clamp(t * 0.25, 0, 0.35));
    } else if (x === 212) {
      // 輪郭直外: 白AAの相対輝度で側面→暖色空洞。寒色黒帯を作らない
      const edge = sideNavy(face, 0.55);
      // 白AAを暖色寄りに解釈した目標
      const warmAa = lerp3(
        [whiteAa[0] * 0.35 + edge[0] * 0.65, whiteAa[1] * 0.3 + edge[1] * 0.7, whiteAa[2] * 0.2 + edge[2] * 0.5],
        cav,
        0.55
      );
      let aaT = clamp(0.35 + t * 0.5, 0.4, 0.85);
      if (y >= 586) aaT = clamp(aaT * 0.75, 0.3, 0.65);
      col = lerp3(edge, warmAa, aaT * 0.7);
      col = lerp3(col, cav, 0.35);
    } else {
      // x213–216: 本の外側。既存空洞をベースに、硬境界だけ周囲木目で軟接合
      const orig = get(base, x, y);
      // 水平の自然グラデ: 近傍空洞〜木目参照
      const expected = lerp3(cavCore, woodRef, clamp((x - 213) / 10, 0, 0.45));
      // 白版と同じ場所の相対: t が大きいほど空洞寄り（ほぼそのまま）
      const soft = lerp3(sideNavy(face, 0.5), expected, clamp(0.55 + (x - 213) * 0.12, 0.55, 0.95));
      // 元画像を主、軟接合を副（べた塗り禁止）
      const mix = x === 213 ? 0.42 : x === 214 ? 0.28 : x === 215 ? 0.16 : 0.1;
      col = lerp3(orig, soft, mix);
      // 足元だけ棚へ溶かす
      if (y >= 594) {
        const shelf = get(base, Math.min(222, x + 4), Math.min(598, y + 1));
        col = lerp3(col, lerp3(col, shelf, 0.35), (y - 594) / 3);
      }
    }

    // 接地行: 黒い四角・縦線を残さない
    if (y >= 594 && x <= 214) {
      const shelf = get(base, 218, Math.min(y + 1, 598));
      col = lerp3(col, shelf, 0.15 + (y - 594) * 0.12);
    }

    set(x, y, ...col);
  }
}

let outside = 0;
let diffN = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (out[i] === base[i] && out[i + 1] === base[i + 1] && out[i + 2] === base[i + 2])
      continue;
    diffN++;
    if (x < X0 || x > X1 || y < Y0 || y > Y1) outside++;
  }
}
if (outside > 0) throw new Error("outside region: " + outside);
if (!srcBytes.equals(fs.readFileSync(SRC))) throw new Error("complete modified!");

const tmp = OUT + ".tmp.png";
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, OUT);

console.log({ OUT, diffN, outside, region: { X0, X1, Y0, Y1 } });

function row(buf, y) {
  return Array.from({ length: 12 }, (_, i) => {
    const x = 206 + i;
    const rgb = get(buf, x, y);
    return `${x}:${Math.round(lum(...rgb))}`;
  }).join(" ");
}
for (const y of [520, 585, 592, 595]) {
  console.log("before y" + y, row(base, y));
  console.log("after  y" + y, row(out, y));
}

// 比較画像: adopted / v2 / v3
const v2 = "public/images/shelf-background-navy-leather-book5side-v2.png";
const crops = [
  { name: "cavity", box: { left: 198, top: 475, width: 70, height: 130 }, s: 7 },
  { name: "foot", box: { left: 198, top: 575, width: 70, height: 35 }, s: 8 },
  { name: "shelf", box: { left: 55, top: 455, width: 200, height: 160 }, s: 3 },
];

async function zoom(path, box, s) {
  return sharp(path)
    .extract(box)
    .resize(box.width * s, box.height * s, {
      kernel: box.width > 100 ? "lanczos3" : "nearest",
    })
    .png()
    .toBuffer();
}

for (const c of crops) {
  const panels = [
    ["採用版", await zoom(SRC, c.box, c.s)],
    ["v2", await zoom(v2, c.box, c.s)],
    ["v3", await zoom(OUT, c.box, c.s)],
  ];
  const pw = c.box.width * c.s;
  const ph = c.box.height * c.s;
  const gap = 12;
  const labelH = 28;
  const totalW = pw * 3 + gap * 4;
  const totalH = ph + labelH + 16;
  const composites = [];
  for (let i = 0; i < 3; i++) {
    const left = gap + i * (pw + gap);
    const lab = Buffer.from(
      `<svg width="${pw}" height="${labelH}"><text x="4" y="18" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${panels[i][0]} ${c.name}</text></svg>`
    );
    composites.push({ input: lab, top: 4, left });
    composites.push({ input: panels[i][1], top: labelH + 4, left });
  }
  await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 3,
      background: { r: 16, g: 16, b: 16 },
    },
  })
    .composite(composites)
    .png()
    .toFile(`public/images/ref/book5side-v3-compare-${c.name}.png`);
}

console.log("compares written");
