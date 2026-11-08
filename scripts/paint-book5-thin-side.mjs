import sharp from "sharp";
import fs from "fs";

/**
 * Book5 right side: 2px light-gray strip (+1px soft AA into cavity).
 * Max 3px effective. Continuous top→bottom. No foot triangle / blue nub.
 * Front x<=208 and tops y<481 restored from base.
 */

const W = 1024;
const H = 664;
const SPINE_R = 208;
const BODY_Y0 = 481;
const BODY_Y1 = 595;
const SRC = "public/images/shelf-background.png";
const BASE_PATH = "public/images/ref/before-book5-thin-side.png";

// Prefer original before first thin-side pass if present; else current
const baseFile = fs.existsSync(BASE_PATH) ? BASE_PATH : SRC;
fs.copyFileSync(baseFile, "public/images/ref/before-book5-thin-side-v2.png");

const { data } = await sharp(baseFile)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const d = Buffer.from(data);
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
function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

let cr = 0,
  cg = 0,
  cb = 0,
  cn = 0;
for (let y = 490; y <= 580; y++) {
  for (let x = 214; x <= 224; x++) {
    const [r, g, b] = get(d, x, y);
    if (lum(r, g, b) < 45) {
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
const cL = Math.max(1, lum(cr, cg, cb));

// Clear narrow strip for redraw
for (let y = BODY_Y0; y <= BODY_Y1 + 2; y++) {
  for (let x = SPINE_R + 1; x <= SPINE_R + 6; x++) {
    set(x, y, cr, cg, cb);
  }
}

// 2px side + 1px AA: relative luminance vs front
// Keep pale: ~92% and ~82% of front; AA ~55% then cavity
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  const [fr, fg, fb] = get(base, SPINE_R, y);
  const fL = Math.max(1, lum(fr, fg, fb));

  // Very light foot tuck — stay light gray, don't go dark block
  const foot = y >= 592 ? smoothstep((y - 592) / 4) * 0.12 : 0;

  // 2px pale side + 1px soft AA (stay light; never a dark slab)
  const targets = [
    fL * (0.93 - foot * 0.05), // x+1
    fL * (0.84 - foot * 0.06), // x+2
    fL * (0.68 - foot * 0.08), // x+3 soft AA
  ];

  for (let dist = 1; dist <= 3; dist++) {
    const x = SPINE_R + dist;
    let targetL = targets[dist - 1];
    targetL = Math.max(
      dist === 3 ? cL + 40 : cL + 70,
      Math.min(fL - 4, targetL)
    );
    const t = Math.max(0, Math.min(1, (fL - targetL) / (fL - cL)));
    let r = lerp(fr, cr, t);
    let g = lerp(fg, cg, t);
    let b = lerp(fb, cb, t);
    // Warm-neutral (kill blue cast)
    const avg = (r + g + b) / 3;
    r = lerp(r, avg * 1.02, 0.45);
    g = lerp(g, avg * 1.0, 0.45);
    b = lerp(b, avg * 0.96, 0.5);
    set(x, y, r, g, b);
  }

  // Soft blend into cavity at x+4 (half way)
  {
    const x = SPINE_R + 4;
    const [sr, sg, sb] = get(d, SPINE_R + 3, y);
    set(x, y, lerp(sr, cr, 0.65), lerp(sg, cg, 0.65), lerp(sb, cb, 0.65));
  }
  for (let x = SPINE_R + 5; x <= SPINE_R + 6; x++) {
    set(x, y, cr, cg, cb);
  }
}

// Light vertical soften on AA column
for (let y = BODY_Y0 + 1; y < BODY_Y1; y++) {
  const x = SPINE_R + 3;
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

// Restore front + tops
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = 72; x <= SPINE_R; x++) {
    const i = idx(x, y);
    d[i] = base[i];
    d[i + 1] = base[i + 1];
    d[i + 2] = base[i + 2];
    d[i + 3] = base[i + 3];
  }
}
for (let y = 450; y < BODY_Y0; y++) {
  for (let x = 72; x <= SPINE_R + 6; x++) {
    const i = idx(x, y);
    d[i] = base[i];
    d[i + 1] = base[i + 1];
    d[i + 2] = base[i + 2];
    d[i + 3] = base[i + 3];
  }
}

let frontCh = 0,
  topsCh = 0,
  outCh = 0,
  sideCh = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const ch =
      d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2];
    if (!ch) continue;
    if (x >= 72 && x <= SPINE_R && y >= BODY_Y0 && y <= BODY_Y1) frontCh++;
    else if (x >= 72 && x <= SPINE_R + 6 && y < BODY_Y0) topsCh++;
    else if (x >= SPINE_R + 1 && x <= SPINE_R + 6 && y >= BODY_Y0 && y <= BODY_Y1 + 2)
      sideCh++;
    else outCh++;
  }
}
console.log({ frontCh, topsCh, sideCh, outCh });

const row = (y) => {
  const parts = [];
  for (let x = 205; x <= 216; x++) {
    const [r, g, b] = get(d, x, y);
    parts.push(`${x}:${lum(r, g, b) | 0}`);
  }
  return parts.join(" ");
};
console.log("side@500", row(500));
console.log("side@592", row(592));
console.log("side@595", row(595));

let blueN = 0;
for (let y = BODY_Y0; y <= BODY_Y1; y++) {
  for (let x = SPINE_R + 1; x <= SPINE_R + 8; x++) {
    const [r, g, b] = get(d, x, y);
    if (b > 90 && r < 120 && b > r + 25) blueN++;
  }
}
console.log({ blueN });

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, SRC);

const beforeSrc = "public/images/ref/before-book5-thin-side-v2.png";
const beforeFull = await sharp(beforeSrc)
  .extract({ left: 198, top: 478, width: 36, height: 125 })
  .resize(216, 750, { kernel: "nearest" })
  .png()
  .toBuffer();
const afterFull = await sharp(SRC)
  .extract({ left: 198, top: 478, width: 36, height: 125 })
  .resize(216, 750, { kernel: "nearest" })
  .png()
  .toBuffer();
const beforeFoot = await sharp(beforeSrc)
  .extract({ left: 200, top: 575, width: 32, height: 28 })
  .resize(320, 280, { kernel: "nearest" })
  .png()
  .toBuffer();
const afterFoot = await sharp(SRC)
  .extract({ left: 200, top: 575, width: 32, height: 28 })
  .resize(320, 280, { kernel: "nearest" })
  .png()
  .toBuffer();

await sharp(afterFull).toFile("public/images/ref/b5-side-after-full.png");
await sharp(afterFoot).toFile("public/images/ref/b5-side-after-foot.png");

const label = (t, w) =>
  Buffer.from(
    `<svg width="${w}" height="24"><text x="6" y="17" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );

await sharp({
  create: {
    width: 460,
    height: 800,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
})
  .composite([
    { input: label("BEFORE side full", 216), top: 4, left: 10 },
    { input: label("AFTER side full", 216), top: 4, left: 236 },
    { input: beforeFull, top: 30, left: 10 },
    { input: afterFull, top: 30, left: 236 },
  ])
  .png()
  .toFile("public/images/ref/b5-side-compare-full.png");

await sharp({
  create: {
    width: 660,
    height: 320,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
})
  .composite([
    { input: label("BEFORE foot", 320), top: 4, left: 10 },
    { input: label("AFTER foot", 320), top: 4, left: 340 },
    { input: beforeFoot, top: 30, left: 10 },
    { input: afterFoot, top: 30, left: 340 },
  ])
  .png()
  .toFile("public/images/ref/b5-side-compare-foot.png");

console.log("done");
