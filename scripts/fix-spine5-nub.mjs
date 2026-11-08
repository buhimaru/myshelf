import sharp from "sharp";
import fs from "fs";

/**
 * Source check:
 * - Cover teal starts at x=228 (far from spine) → not the 1px nub at spine BR
 * - BG has soft-side pixels at x=209 with L≈160–180 near y=585–593
 *   that read as a 1px protrusion past the front edge (x=208)
 * Fix: only those few foot-corner pixels → dark cavity/wood
 */

const W = 1024;
const H = 664;
const SRC = "public/images/shelf-background.png";

fs.copyFileSync(SRC, "public/images/ref/before-spine5-nub.png");

const { data } = await sharp(SRC)
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
  d[i] = Math.round(r);
  d[i + 1] = Math.round(g);
  d[i + 2] = Math.round(b);
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Sample dark cavity just right of the soft side (clean gap pixels)
let cr = 0,
  cg = 0,
  cb = 0,
  cn = 0;
for (let y = 585; y <= 592; y++) {
  for (const x of [211, 212, 213]) {
    const [r, g, b] = get(d, x, y);
    if (lum(r, g, b) < 80) {
      cr += r;
      cg += g;
      cb += b;
      cn++;
    }
  }
}
cr /= Math.max(1, cn);
cg /= Math.max(1, cn);
cb /= Math.max(1, cn);
console.log("cavity sample", { cr, cg, cb, cn });

// Minimal patch: BR corner only
// Rows where soft-side at x=209 is still bright while approaching shelf
const changed = [];
for (let y = 588; y <= 595; y++) {
  for (let x = 209; x <= 210; x++) {
    const [r, g, b] = get(d, x, y);
    const L = lum(r, g, b);
    // Only bright-ish remnant / soft-side flare (not already wood)
    if (L < 85) continue;
    // Prefer cavity; near shelf board (y>=594) blend toward local wood
    let tr = cr,
      tg = cg,
      tb = cb;
    if (y >= 594) {
      const wood = get(d, Math.min(215, x + 4), y);
      if (lum(...wood) > 40 && wood[0] > wood[2]) {
        tr = wood[0];
        tg = wood[1];
        tb = wood[2];
      }
    }
    // Keep a whisper of edge only at x=209 for y<592 (optional tiny side)
    // User wants smooth corner → fully darken these foot pixels
    set(x, y, tr, tg, tb);
    changed.push({ x, y, fromL: L | 0 });
  }
}
console.log("changed", changed.length, changed);

// Verify protected regions
let bodyCh = 0,
  topsCh = 0,
  outCh = 0,
  sideUpperCh = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const ch =
      d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2];
    if (!ch) continue;
    if (x >= 72 && x <= 208 && y >= 481 && y <= 595) bodyCh++;
    else if (x >= 72 && x <= 208 && y < 481) topsCh++;
    else if (x >= 209 && x <= 210 && y >= 481 && y < 588) sideUpperCh++;
    else if (x >= 209 && x <= 210 && y >= 588 && y <= 595) {
      /* edit ok */
    } else outCh++;
  }
}
console.log({ bodyCh, topsCh, sideUpperCh, outCh });

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, SRC);

// BEFORE / AFTER zooms (same crop, nearest for pixel clarity)
const crop = { left: 200, top: 585, width: 28, height: 22 };
const before = await sharp("public/images/ref/before-spine5-nub.png")
  .extract(crop)
  .resize(420, 330, { kernel: "nearest" })
  .png()
  .toBuffer();
const after = await sharp(SRC)
  .extract(crop)
  .resize(420, 330, { kernel: "nearest" })
  .png()
  .toBuffer();

await sharp(before).toFile("public/images/ref/nub-before-zoom.png");
await sharp(after).toFile("public/images/ref/nub-after-zoom.png");

const label = (t) =>
  Buffer.from(
    `<svg width="420" height="26"><text x="8" y="18" fill="#eee" font-size="14" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );

await sharp({
  create: {
    width: 860,
    height: 370,
    channels: 3,
    background: { r: 18, g: 18, b: 18 },
  },
})
  .composite([
    { input: label("BEFORE (5巻右下)"), top: 4, left: 10 },
    { input: label("AFTER (5巻右下)"), top: 4, left: 440 },
    { input: before, top: 32, left: 10 },
    { input: after, top: 32, left: 440 },
  ])
  .png()
  .toFile("public/images/ref/nub-before-after.png");

// Post-check: no bright pixels at x=209–210 for y=588–595
const chk = await sharp(SRC).ensureAlpha().raw().toBuffer();
const leftover = [];
for (let y = 588; y <= 595; y++) {
  for (let x = 209; x <= 210; x++) {
    const [r, g, b] = get(chk, x, y);
    const L = lum(r, g, b);
    if (L > 100) leftover.push({ x, y, L: L | 0 });
  }
}
console.log("leftover bright at corner", leftover);
console.log("done");
