import sharp from "sharp";
import fs from "fs";

/**
 * Stronger local TR corner join + softer BR AA (no width growth, no front rewrite).
 * Starts from current shelf-background.png; before snapshot already at before-tr-br-local.png
 */

const W = 1024;
const H = 664;
const SPINE_R = 208;
const SRC = "public/images/shelf-background.png";
const BEFORE = "public/images/ref/before-tr-br-local.png";

const { data } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: beforeData } = await sharp(BEFORE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const d = Buffer.from(data);
const before = Buffer.from(beforeData);
// snapshot of current (post-v1) for front restore reference of body
const cur = Buffer.from(data);

function idx(x, y) {
  return (y * W + x) * 4;
}
function get(buf, x, y) {
  const i = idx(x, y);
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function set(x, y, r, g, b) {
  const i = idx(x, y);
  d[i] = Math.max(0, Math.min(255, Math.round(r)));
  d[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
  d[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

const cavity = get(before, 214, 520);
const sideRef = {
  209: get(before, 209, 520),
  210: get(before, 210, 520),
  211: get(before, 211, 520),
};

// ─── ① TR: rebuild only the corner junction ───
// Target geometry: horizontal top contour meets vertical thin side at ~ (209,477-480)
for (let y = 474; y <= 480; y++) {
  const topCore = get(before, 204, y); // horizontal top tone
  const bodySide = {
    209: get(cur, 209, 482),
    210: get(cur, 210, 482),
    211: get(cur, 211, 482),
  };
  const t = (y - 474) / 6; // 0 at top band → 1 near body

  // x208: only soften if it's a dark bite into the front edge of the top
  {
    const x = 208;
    const c = get(d, x, y);
    const left = get(d, 206, y);
    if (lum(...c) < lum(...left) - 25 && y >= 475 && y <= 478) {
      set(x, y, ...lerp3(c, left, 0.55));
    }
  }

  for (let dist = 1; dist <= 3; dist++) {
    const x = SPINE_R + dist;
    // Corner fill: blend topCore→bodySide with fade by dist
    const sideT = bodySide[209 + dist - 1] || bodySide[211];
    let col = lerp3(topCore, sideT, 0.35 + t * 0.55);
    // Outer AA fades to cavity
    if (dist === 3) col = lerp3(col, cavity, 0.35 + (1 - t) * 0.25);
    if (dist === 2) col = lerp3(col, cavity, 0.08 * (1 - t));
    // Earliest rows stay softer
    if (y <= 475) col = lerp3(col, cavity, 0.25 + dist * 0.08);

    // Always apply in this tiny window (overwrite dark notch)
    const prev = get(d, x, y);
    // Don't darken an already-good pale pixel
    if (lum(...col) >= lum(...prev) - 2 || lum(...prev) < 160) {
      set(x, y, ...col);
    }
  }
}

// Explicit vertex fill: kill remaining dark bite at (209-210, 475-478)
for (let y = 475; y <= 478; y++) {
  for (let x = 208; x <= 210; x++) {
    const c = get(d, x, y);
    const n1 = get(d, x - 1, y);
    const n2 = get(d, x, Math.min(480, y + 1));
    const n3 = get(d, Math.min(211, x + 1), y);
    const avg = [
      (n1[0] + n2[0] + n3[0]) / 3,
      (n1[1] + n2[1] + n3[1]) / 3,
      (n1[2] + n2[2] + n3[2]) / 3,
    ];
    if (lum(...c) < lum(...avg) - 18) {
      set(x, y, ...lerp3(c, avg, 0.75));
    }
  }
}

// Smooth join into body side
for (let x = 209; x <= 211; x++) {
  for (let y = 479; y <= 482; y++) {
    const a = get(d, x, y - 1);
    const b = get(d, x, y);
    const c = get(d, x, y + 1);
    set(
      x,
      y,
      a[0] * 0.2 + b[0] * 0.6 + c[0] * 0.2,
      a[1] * 0.2 + b[1] * 0.6 + c[1] * 0.2,
      a[2] * 0.2 + b[2] * 0.6 + c[2] * 0.2
    );
  }
}

// ─── ② BR: soften dark AA rim; keep 2-3px pale side ───
for (let y = 582; y <= 595; y++) {
  // Lift side columns toward mid-side (pale)
  for (let dist = 1; dist <= 2; dist++) {
    const x = SPINE_R + dist;
    const ref = sideRef[209 + dist - 1];
    const c = get(d, x, y);
    // Pull up if darker than mid
    if (lum(...c) < lum(...ref) - 5) {
      set(x, y, ...lerp3(c, ref, 0.65));
    }
  }
  // x211: keep as soft mid-gray side, not dark
  {
    const x = 211;
    const ref = sideRef[211];
    const c = get(d, x, y);
    const target = lerp3(ref, get(d, 210, y), 0.25);
    if (lum(...c) < lum(...target) - 4) set(x, y, ...lerp3(c, target, 0.7));
  }
  // x212: soft AA — between 211 and cavity, lighter than before (no black line)
  {
    const x = 212;
    const side = get(d, 211, y);
    const ideal = lerp3(side, cavity, 0.42); // lighter AA
    set(x, y, ...ideal);
  }
}

// Foot: pale side lands on shelf — no dark L under corner
for (let y = 594; y <= 596; y++) {
  const shelf = get(before, 203, Math.min(598, y + 1));
  for (let dist = 1; dist <= 3; dist++) {
    const x = SPINE_R + dist;
    const above = get(d, x, Math.max(582, y - 1));
    const c = get(d, x, y);
    // If too dark vs above side, lift toward above then soft shelf
    if (lum(...c) < lum(...above) - 25 || lum(...c) < 90) {
      let col = lerp3(above, shelf, y >= 596 ? 0.45 : 0.2);
      // keep slightly darker than face but not black
      if (lum(...col) < 110) col = lerp3(col, above, 0.5);
      set(x, y, ...col);
    }
  }
}

// Restore body front strictly
for (let y = 481; y <= 595; y++) {
  for (let x = 72; x <= SPINE_R; x++) {
    const i = idx(x, y);
    d[i] = before[i];
    d[i + 1] = before[i + 1];
    d[i + 2] = before[i + 2];
  }
}

// Restore tops except local TR patch
for (let y = 450; y < 481; y++) {
  for (let x = 72; x <= 220; x++) {
    if (y >= 474 && y <= 480 && x >= 207 && x <= 212) continue;
    const i = idx(x, y);
    d[i] = before[i];
    d[i + 1] = before[i + 1];
    d[i + 2] = before[i + 2];
  }
}

// Re-apply body side from cur for y482-579 unchanged (we may have touched 479-482 join)
// Keep BR changes for y582+; keep mid side from cur for y482-581
for (let y = 482; y <= 581; y++) {
  for (let x = 209; x <= 212; x++) {
    const i = idx(x, y);
    d[i] = cur[i];
    d[i + 1] = cur[i + 1];
    d[i + 2] = cur[i + 2];
  }
}
// But re-run BR lift on 582-595 already done above on d — good.
// Re-do BR section after mid restore:
for (let y = 582; y <= 595; y++) {
  for (let dist = 1; dist <= 2; dist++) {
    const x = SPINE_R + dist;
    const ref = sideRef[209 + dist - 1];
    const c = get(d, x, y);
    if (lum(...c) < lum(...ref) - 5) set(x, y, ...lerp3(c, ref, 0.65));
  }
  {
    const ref = sideRef[211];
    const c = get(d, 211, y);
    const target = lerp3(ref, get(d, 210, y), 0.25);
    if (lum(...c) < lum(...target) - 4) set(211, y, ...lerp3(c, target, 0.7));
  }
  {
    const side = get(d, 211, y);
    set(212, y, ...lerp3(side, cavity, 0.42));
  }
}
for (let y = 594; y <= 596; y++) {
  const shelf = get(before, 203, Math.min(598, y + 1));
  for (let dist = 1; dist <= 3; dist++) {
    const x = SPINE_R + dist;
    const above = get(d, x, Math.max(582, y - 1));
    const c = get(d, x, y);
    if (lum(...c) < lum(...above) - 25 || lum(...c) < 90) {
      let col = lerp3(above, shelf, y >= 596 ? 0.45 : 0.2);
      if (lum(...col) < 110) col = lerp3(col, above, 0.5);
      set(x, y, ...col);
    }
  }
}

let front = 0,
  elseCh = 0,
  tr = 0,
  br = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (d[i] === before[i] && d[i + 1] === before[i + 1] && d[i + 2] === before[i + 2])
      continue;
    if (x <= SPINE_R && y >= 481 && y <= 595) front++;
    else if (y >= 474 && y <= 482 && x >= 207 && x <= 212) tr++;
    else if (y >= 582 && y <= 597 && x >= 209 && x <= 214) br++;
    else elseCh++;
  }
}
console.log({ front, tr, br, elseCh });

const row = (y) =>
  [207, 208, 209, 210, 211, 212]
    .map((x) => `${x}:${lum(...get(d, x, y)) | 0}`)
    .join(" ");
console.log("TR476", row(476));
console.log("TR478", row(478));
console.log("TR480", row(480));
console.log("BR590", row(590));
console.log("BR595", row(595));
console.log("BR596", row(596));

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, SRC);

const trBox = { left: 198, top: 468, width: 28, height: 28 };
const brBox = { left: 200, top: 575, width: 28, height: 28 };
await sharp(BEFORE).extract(trBox).resize(336, 336, { kernel: "nearest" }).toFile("public/images/ref/fix-tr-before.png");
await sharp(SRC).extract(trBox).resize(336, 336, { kernel: "nearest" }).toFile("public/images/ref/fix-tr-after.png");
await sharp(BEFORE).extract(brBox).resize(336, 336, { kernel: "nearest" }).toFile("public/images/ref/fix-br-before.png");
await sharp(SRC).extract(brBox).resize(336, 336, { kernel: "nearest" }).toFile("public/images/ref/fix-br-after.png");

const label = (t, w) =>
  Buffer.from(
    `<svg width="${w}" height="22"><text x="4" y="16" fill="#eee" font-size="12" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );
async function pair(beforeP, afterP, titleB, titleA, out) {
  const b = await sharp(beforeP).png().toBuffer();
  const a = await sharp(afterP).png().toBuffer();
  await sharp({
    create: { width: 700, height: 380, channels: 3, background: { r: 16, g: 16, b: 16 } },
  })
    .composite([
      { input: label(titleB, 336), top: 4, left: 8 },
      { input: label(titleA, 336), top: 4, left: 356 },
      { input: b, top: 28, left: 8 },
      { input: a, top: 28, left: 356 },
    ])
    .png()
    .toFile(out);
}
await pair(
  "public/images/ref/fix-tr-before.png",
  "public/images/ref/fix-tr-after.png",
  "BEFORE TR (red)",
  "AFTER TR (red)",
  "public/images/ref/fix-tr-compare.png"
);
await pair(
  "public/images/ref/fix-br-before.png",
  "public/images/ref/fix-br-after.png",
  "BEFORE BR (blue)",
  "AFTER BR (blue)",
  "public/images/ref/fix-br-compare.png"
);

// browser-scale sims
const scaled = await sharp(SRC).resize(703, 456, { kernel: "lanczos3" }).png().toBuffer();
const sx = 703 / 1024,
  sy = 456 / 664;
await sharp(scaled)
  .extract({
    left: Math.round(198 * sx),
    top: Math.round(468 * sy),
    width: Math.round(32 * sx),
    height: Math.round(32 * sy),
  })
  .resize(320, 320, { kernel: "nearest" })
  .toFile("public/images/ref/browser-sim-tr.png");
await sharp(scaled)
  .extract({
    left: Math.round(200 * sx),
    top: Math.round(575 * sy),
    width: Math.round(32 * sx),
    height: Math.round(32 * sy),
  })
  .resize(320, 320, { kernel: "nearest" })
  .toFile("public/images/ref/browser-sim-br.png");

console.log("done");
