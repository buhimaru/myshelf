import sharp from "sharp";
import fs from "fs";

/**
 * Minimal fix: navy book5 BR protrusion at x=212 (anomalous light AA).
 * BEFORE backup must already exist and stay untouched.
 */

const W = 1024;
const H = 664;
const BEFORE = "public/images/shelf-background-navy-leather-before.png";
const OUT = "public/images/shelf-background-navy-leather.png";

if (!fs.existsSync(BEFORE)) {
  throw new Error("Missing before backup: " + BEFORE);
}

const beforeBytes = fs.readFileSync(BEFORE);
const { data } = await sharp(BEFORE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const out = Buffer.from(data);
const base = Buffer.from(data);

function idx(x, y) {
  return (y * W + x) * 4;
}
function get(buf, x, y) {
  const i = idx(x, y);
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function set(x, y, r, g, b) {
  const i = idx(x, y);
  out[i] = Math.round(r);
  out[i + 1] = Math.round(g);
  out[i + 2] = Math.round(b);
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const aaRef = get(base, 212, 520);
const cav = get(base, 213, 520);

const changed = [];
for (let y = 574; y <= 595; y++) {
  const cur = get(out, 212, y);
  const curL = lum(...cur);
  const aaL = lum(...aaRef);
  if (curL > aaL + 8) {
    const side = get(out, 211, y);
    const ideal = lerp3(aaRef, side, 0.15);
    const final = lerp3(ideal, cav, 0.12);
    set(212, y, ...final);
    changed.push({ x: 212, y, beforeL: curL | 0, afterL: lum(...get(out, 212, y)) | 0 });
  }
}

let diffN = 0;
let outside = 0;
const touched = new Set(changed.map((c) => `${c.x},${c.y}`));
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (out[i] === base[i] && out[i + 1] === base[i + 1] && out[i + 2] === base[i + 2]) {
      continue;
    }
    diffN++;
    if (!touched.has(`${x},${y}`)) outside++;
  }
}

const tmp = OUT + ".tmp.png";
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, OUT);

// Ensure before file bytes unchanged
const beforeAfter = fs.readFileSync(BEFORE);
if (!beforeBytes.equals(beforeAfter)) {
  throw new Error("BEFORE backup was modified!");
}

console.log({
  changed: changed.length,
  diffN,
  outside,
  rows: changed.map((c) => c.y),
  samples: changed.slice(0, 3),
});

for (const y of [575, 585, 590, 595]) {
  const row = [];
  for (let x = 208; x <= 214; x++) {
    row.push(`${x}:${lum(...get(out, x, y)) | 0}`);
  }
  console.log("after y" + y, row.join(" "));
}

const box = { left: 198, top: 575, width: 36, height: 30 };
await sharp(BEFORE)
  .extract(box)
  .resize(360, 300, { kernel: "nearest" })
  .toFile("public/images/ref/navy-br-before-zoom.png");
await sharp(OUT)
  .extract(box)
  .resize(360, 300, { kernel: "nearest" })
  .toFile("public/images/ref/navy-br-after-zoom.png");

const label = (t, w) =>
  Buffer.from(
    `<svg width="${w}" height="22"><text x="4" y="16" fill="#eee" font-size="12" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );
const b = await sharp("public/images/ref/navy-br-before-zoom.png").png().toBuffer();
const a = await sharp("public/images/ref/navy-br-after-zoom.png").png().toBuffer();
await sharp({
  create: { width: 740, height: 340, channels: 3, background: { r: 16, g: 16, b: 16 } },
})
  .composite([
    { input: label("BEFORE navy BR", 360), top: 4, left: 8 },
    { input: label("AFTER navy BR", 360), top: 4, left: 380 },
    { input: b, top: 28, left: 8 },
    { input: a, top: 28, left: 380 },
  ])
  .png()
  .toFile("public/images/ref/navy-br-compare.png");

console.log("done");
