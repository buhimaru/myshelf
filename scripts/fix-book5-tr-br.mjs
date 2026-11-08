import sharp from "sharp";
import fs from "fs";

/**
 * Local-only fixes for book5:
 * ① TR chip: connect top edge + thin side (y~475-480, x~208-211)
 * ② BR black rim: lighten over-dark AA + soft shelf grounding (no black fill)
 * Front x<=208 body, tops elsewhere, side width ~2-3px preserved.
 */

const W = 1024;
const H = 664;
const SPINE_R = 208;
const SRC = "public/images/shelf-background.png";
const BEFORE = "public/images/ref/before-tr-br-local.png";

fs.copyFileSync(SRC, BEFORE);

const { data } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  d[i + 3] = 255;
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
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Reference mid-side colors (keep width profile)
const sideRef = {
  209: get(base, 209, 520),
  210: get(base, 210, 520),
  211: get(base, 211, 520),
  212: get(base, 212, 520),
};
const cavity = get(base, 214, 520);

// ─── ① TR corner: join top contour to thin side ───
// Tops currently die into dark notch at x209-210 for y475-480.
// Extend pale side upward a few px; fill chip without new big top face.
for (let y = 474; y <= 480; y++) {
  const front = get(base, SPINE_R, Math.min(y, 481));
  const topL = lum(...get(base, 205, y));
  // how “into” the top band we are (faint→solid)
  const bandT = clamp((topL - 20) / 180, 0, 1);

  // Target luminances: approach mid-side as we near body (y→481)
  const towardBody = clamp((y - 474) / 7, 0, 1);
  const targets = [
    null,
    lerp(topL * 0.85, lum(...sideRef[209]), towardBody),
    lerp(topL * 0.7, lum(...sideRef[210]), towardBody),
    lerp(topL * 0.45, lum(...sideRef[211]), towardBody),
  ];

  for (let dist = 1; dist <= 3; dist++) {
    const x = SPINE_R + dist;
    const ref = sideRef[209 + dist - 1] || sideRef[211];
    let tL = targets[dist];
    // Keep pale; never darker than existing side mid
    tL = clamp(tL, lum(...cavity) + 50, lum(...front) - 4);

    // Mix front→cavity to hit target L, then nudge toward warm-neutral sideRef
    const fL = Math.max(1, lum(...front));
    const cL = Math.max(1, lum(...cavity));
    const tMix = clamp((fL - tL) / (fL - cL), 0, 1);
    let col = lerp3(front, cavity, tMix);
    col = lerp3(col, ref, 0.35 + 0.35 * towardBody);

    // Soften earliest rows (only AA into cavity)
    if (y <= 475 && dist >= 2) {
      col = lerp3(col, cavity, 0.35 * (dist - 1));
    }
    // Only paint if we’re improving a dark notch / joining side
    const cur = get(d, x, y);
    const curL = lum(...cur);
    if (curL < tL - 5 || (y >= 477 && dist <= 2 && curL < lum(...sideRef[209]) - 20)) {
      // blend with existing to avoid hard rewrite of intact top AA
      const out = lerp3(cur, col, 0.55 + 0.35 * bandT * towardBody);
      set(x, y, out[0], out[1], out[2]);
    }
  }
}

// Fill the actual chip: dark pixels cutting into corner around (208-210, 475-478)
for (let y = 475; y <= 478; y++) {
  for (let x = 207; x <= 210; x++) {
    const cur = get(d, x, y);
    const curL = lum(...cur);
    const left = get(d, Math.max(200, x - 1), y);
    const below = get(d, x, Math.min(481, y + 1));
    const leftL = lum(...left);
    const belowL = lum(...below);
    // chip = much darker than neighbors that are already book surface
    if (curL < 90 && (leftL > 100 || belowL > 140)) {
      const target = lerp3(left, below, 0.45);
      const tL = Math.max(lum(...target), leftL * 0.85, 100);
      const scale = tL / Math.max(1, lum(...target));
      set(x, y, target[0] * scale, target[1] * scale, target[2] * scale);
    }
  }
}

// Ensure x=208 vertical right edge of front stays continuous into top (no new width)
for (let y = 476; y <= 480; y++) {
  const cur = get(d, SPINE_R, y);
  const below = get(base, SPINE_R, 481);
  const above = get(base, SPINE_R - 2, y);
  const curL = lum(...cur);
  if (curL < 150 && lum(...above) > 100) {
    const out = lerp3(cur, lerp3(above, below, 0.5), 0.65);
    set(SPINE_R, y, out[0], out[1], out[2]);
  }
}

// Soft vertical join at y481 so side doesn’t pop
for (let x = 209; x <= 211; x++) {
  const a = get(d, x, 480);
  const b = get(d, x, 481);
  const c = get(d, x, 482);
  const mid = [
    a[0] * 0.25 + b[0] * 0.5 + c[0] * 0.25,
    a[1] * 0.25 + b[1] * 0.5 + c[1] * 0.25,
    a[2] * 0.25 + b[2] * 0.5 + c[2] * 0.25,
  ];
  set(x, 481, mid[0], mid[1], mid[2]);
}

// ─── ② BR: remove black rim / L, keep thin pale side ───
// Mid-side targets for lower third
for (let y = 580; y <= 595; y++) {
  const foot = clamp((y - 588) / 7, 0, 1);
  for (let dist = 1; dist <= 3; dist++) {
    const x = SPINE_R + dist;
    const ref = sideRef[209 + dist - 1];
    const cur = get(d, x, y);
    const refL = lum(...ref);
    const curL = lum(...cur);
    // Only lift if darker than mid-side (blackish rim)
    if (curL < refL - 8) {
      // pull toward pale side; at foot slightly softer, not darker
      const lift = 0.55 + foot * 0.2;
      let out = lerp3(cur, ref, lift);
      // tiny warm neutralize
      const avg = (out[0] + out[1] + out[2]) / 3;
      out = [
        lerp(out[0], avg * 1.02, 0.3),
        lerp(out[1], avg, 0.3),
        lerp(out[2], avg * 0.97, 0.35),
      ];
      set(x, y, out[0], out[1], out[2]);
    }
  }
  // Soften over-dark AA column x=212 toward a mid-brown-gray, not black slab
  {
    const x = 212;
    const cur = get(d, x, y);
    const side = get(d, 211, y);
    const cav = cavity;
    // Ideal AA: between side and cavity but not near-black slab
    const ideal = lerp3(side, cav, 0.55);
    if (lum(...cur) < lum(...ideal) - 5) {
      set(x, y, ...lerp3(cur, ideal, 0.7));
    }
  }
}

// Soft shelf grounding under BR corner — replace hard black cavity under foot
// with blend toward shelf board colors (sampled left of spine on same rows)
for (let y = 595; y <= 598; y++) {
  const shelfSample = get(base, 204, Math.min(y, 598));
  const shelf2 = get(base, 200, Math.min(y, 598));
  const shelf = lerp3(shelfSample, shelf2, 0.3);
  for (let x = 209; x <= 214; x++) {
    const cur = get(d, x, y);
    const curL = lum(...cur);
    // Near-black under/beside foot → blend to shelf, keep soft shadow
    if (curL < 40) {
      const dist = x - SPINE_R;
      // closer to side = slightly darker contact; outer = shelf
      const t = clamp(0.35 + dist * 0.12 + (y - 595) * 0.15, 0.35, 0.85);
      const shadow = lerp3(get(d, 211, 594), shelf, t);
      set(x, y, ...lerp3(cur, shadow, 0.8));
    }
  }
}

// Restore front face body (x<=208, y>=481) except we may have touched x=208 at tops only
for (let y = 481; y <= 595; y++) {
  for (let x = 72; x <= SPINE_R; x++) {
    // allow x=208? keep front locked
    const i = idx(x, y);
    d[i] = base[i];
    d[i + 1] = base[i + 1];
    d[i + 2] = base[i + 2];
    d[i + 3] = base[i + 3];
  }
}

// Restore tops except the local TR patch x207-211, y474-480
for (let y = 450; y < 481; y++) {
  for (let x = 72; x <= 220; x++) {
    if (y >= 474 && y <= 480 && x >= 207 && x <= 211) continue;
    const i = idx(x, y);
    d[i] = base[i];
    d[i + 1] = base[i + 1];
    d[i + 2] = base[i + 2];
    d[i + 3] = base[i + 3];
  }
}

// Stats
let ch = { tr: 0, br: 0, front: 0, else: 0 };
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (d[i] === base[i] && d[i + 1] === base[i + 1] && d[i + 2] === base[i + 2]) continue;
    if (x >= 72 && x <= SPINE_R && y >= 481 && y <= 595) ch.front++;
    else if (y >= 474 && y <= 481 && x >= 207 && x <= 212) ch.tr++;
    else if (y >= 580 && y <= 598 && x >= 209 && x <= 214) ch.br++;
    else ch.else++;
  }
}
console.log(ch);

const row = (y) => {
  const parts = [];
  for (let x = 205; x <= 214; x++) {
    const [r, g, b] = get(d, x, y);
    parts.push(`${x}:${lum(r, g, b) | 0}`);
  }
  return parts.join(" ");
};
console.log("TR y476", row(476));
console.log("TR y478", row(478));
console.log("TR y480", row(480));
console.log("TR y481", row(481));
console.log("BR y590", row(590));
console.log("BR y595", row(595));
console.log("BR y596", row(596));

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, SRC);

// Compares
const mk = async (src, box, scale, out) => {
  await sharp(src)
    .extract(box)
    .resize(box.width * scale, box.height * scale, { kernel: "nearest" })
    .toFile(out);
};
const trBox = { left: 198, top: 468, width: 28, height: 28 };
const brBox = { left: 200, top: 575, width: 28, height: 28 };
await mk(BEFORE, trBox, 12, "public/images/ref/fix-tr-before.png");
await mk(SRC, trBox, 12, "public/images/ref/fix-tr-after.png");
await mk(BEFORE, brBox, 12, "public/images/ref/fix-br-before.png");
await mk(SRC, brBox, 12, "public/images/ref/fix-br-after.png");

const label = (t, w) =>
  Buffer.from(
    `<svg width="${w}" height="22"><text x="4" y="16" fill="#eee" font-size="12" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );

const beforeTr = await sharp("public/images/ref/fix-tr-before.png").png().toBuffer();
const afterTr = await sharp("public/images/ref/fix-tr-after.png").png().toBuffer();
const beforeBr = await sharp("public/images/ref/fix-br-before.png").png().toBuffer();
const afterBr = await sharp("public/images/ref/fix-br-after.png").png().toBuffer();

await sharp({
  create: { width: 700, height: 380, channels: 3, background: { r: 16, g: 16, b: 16 } },
})
  .composite([
    { input: label("BEFORE TR (red)", 336), top: 4, left: 8 },
    { input: label("AFTER TR (red)", 336), top: 4, left: 356 },
    { input: beforeTr, top: 28, left: 8 },
    { input: afterTr, top: 28, left: 356 },
  ])
  .png()
  .toFile("public/images/ref/fix-tr-compare.png");

await sharp({
  create: { width: 700, height: 380, channels: 3, background: { r: 16, g: 16, b: 16 } },
})
  .composite([
    { input: label("BEFORE BR (blue)", 336), top: 4, left: 8 },
    { input: label("AFTER BR (blue)", 336), top: 4, left: 356 },
    { input: beforeBr, top: 28, left: 8 },
    { input: afterBr, top: 28, left: 356 },
  ])
  .png()
  .toFile("public/images/ref/fix-br-compare.png");

console.log("done");
