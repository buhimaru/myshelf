import sharp from "sharp";
import fs from "fs";

const CAND = "public/images/prototypes/shelf-empty-candidate-user.jpg";
const ADOPTED = "public/images/shelf-background-navy-leather-complete.png";
const FILL = "public/images/prototypes/shelf-empty-candidate-1024x664.png";

const cm = await sharp(CAND).metadata();
const am = await sharp(ADOPTED).metadata();
console.log("candidate", cm.width, cm.height, cm.format);
console.log("adopted", am.width, am.height, am.format);

const aspectC = cm.width / cm.height;
const aspectA = am.width / am.height;
console.log("aspect cand", aspectC.toFixed(4), "adopted", aspectA.toFixed(4), "Δ", (aspectC - aspectA).toFixed(4));

// Use cover/contain carefully: if aspect nearly same, fill is OK
await sharp(CAND).resize(1024, 664, { fit: "fill" }).png().toFile(FILL);

const cRaw = await sharp(FILL).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const aRaw = await sharp(ADOPTED).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = 1024;
const H = 664;

function get(buf, x, y) {
  const i = (y * W + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function findLips(buf, xSample) {
  const lips = [];
  for (let y = 30; y < H - 30; y++) {
    const L = lum(...get(buf, xSample, y));
    const L0 = lum(...get(buf, xSample, y - 2));
    const L1 = lum(...get(buf, xSample, y + 2));
    if (L > L0 + 6 && L > L1 + 4 && L > 55) lips.push({ y, L: Math.round(L) });
  }
  const clusters = [];
  for (const p of lips) {
    const last = clusters[clusters.length - 1];
    if (last && p.y - last.y < 8) {
      if (p.L > last.L) {
        last.y = p.y;
        last.L = p.L;
      }
    } else clusters.push({ ...p });
  }
  return clusters;
}

function regionMean(buf, x0, y0, x1, y1) {
  let s = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      s += lum(...get(buf, x, y));
      n++;
    }
  }
  return s / n;
}

const aLips = findLips(aRaw.data, 420);
const cLips = findLips(cRaw.data, 420);
console.log("adopted lips x420", aLips.map((p) => p.y).join(","));
console.log("cand lips x420", cLips.map((p) => p.y).join(","));

// Known layout sitY: 152, 286, 432, 592
const known = [152, 286, 432, 592];
console.log("known sitY", known.join(","));

function nearest(list, target) {
  if (!list.length) return null;
  return list.reduce((b, p) => (Math.abs(p.y - target) < Math.abs(b.y - target) ? p : b));
}

for (const t of known) {
  const a = nearest(aLips, t);
  const c = nearest(cLips, t);
  console.log(
    `sitY~${t}: adopted ${a?.y ?? "-"} cand ${c?.y ?? "-"} Δ ${a && c ? c.y - a.y : "n/a"}`
  );
}

console.log("LED mean adopted", regionMean(aRaw.data, 780, 200, 845, 255).toFixed(1));
console.log("LED mean cand", regionMean(cRaw.data, 780, 200, 845, 255).toFixed(1));
console.log("vinyl mean adopted", regionMean(aRaw.data, 760, 360, 870, 460).toFixed(1));
console.log("vinyl mean cand", regionMean(cRaw.data, 760, 360, 870, 460).toFixed(1));
console.log("bay4-left adopted", regionMean(aRaw.data, 80, 480, 210, 590).toFixed(1));
console.log("bay4-left cand (should be wood)", regionMean(cRaw.data, 80, 480, 210, 590).toFixed(1));

// Left/right frame detection: dark→wood transition
function frameX(buf, y, fromLeft) {
  if (fromLeft) {
    for (let x = 0; x < 120; x++) {
      if (lum(...get(buf, x, y)) > 40) return x;
    }
  } else {
    for (let x = W - 1; x > W - 120; x--) {
      if (lum(...get(buf, x, y)) > 40) return x;
    }
  }
  return null;
}
console.log("frame L adopted/cand @y300", frameX(aRaw.data, 300, true), frameX(cRaw.data, 300, true));
console.log("frame R adopted/cand @y300", frameX(aRaw.data, 300, false), frameX(cRaw.data, 300, false));

// Diff heatmap summary outside spines (structural match)
let sumAbs = 0;
let n = 0;
for (let y = 0; y < H; y += 2) {
  for (let x = 0; x < W; x += 2) {
    if (x >= 70 && x <= 220 && y >= 470 && y <= 600) continue; // skip spine zone
    sumAbs += Math.abs(lum(...get(aRaw.data, x, y)) - lum(...get(cRaw.data, x, y)));
    n++;
  }
}
console.log("mean |ΔL| outside spine zone", (sumAbs / n).toFixed(2));

// Compare crops
const label = (t, w) =>
  Buffer.from(
    `<svg width="${w}" height="24"><text x="6" y="17" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );

async function pair(name, box, scale) {
  const pw = box.width * scale;
  const ph = box.height * scale;
  const a = await sharp(ADOPTED)
    .extract(box)
    .resize(pw, ph, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const b = await sharp(FILL)
    .extract(box)
    .resize(pw, ph, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: pw * 2 + 28,
      height: ph + 40,
      channels: 3,
      background: { r: 16, g: 16, b: 16 },
    },
  })
    .composite([
      { input: label(`採用版 ${name}`, pw), top: 4, left: 8 },
      { input: label(`新空棚 ${name}`, pw), top: 4, left: pw + 20 },
      { input: a, top: 30, left: 8 },
      { input: b, top: 30, left: pw + 20 },
    ])
    .png()
    .toFile(`public/images/ref/empty-cand-geom-${name}.png`);
}

await pair("bay4", { left: 55, top: 455, width: 220, height: 160 }, 3);
await pair("led", { left: 740, top: 180, width: 160, height: 120 }, 3);
await pair("vinyl", { left: 720, top: 340, width: 200, height: 160 }, 3);

console.log("geom compares written");
