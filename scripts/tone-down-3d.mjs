import sharp from "sharp";
import fs from "fs";

/**
 * Aggressively match ideal: thin soft tops + soft book5 right falloff.
 * Front face body (y>=482, x=72..208) untouched.
 */

const bgPath = "public/images/shelf-background.png";
const snapPath = "public/images/ref/bg-before-tone-down-v2.png";
const idealPath = "public/images/ref/ideal-normalized-918.png";

fs.writeFileSync(snapPath, await sharp(bgPath).png().toBuffer());

const { data, info } = await sharp(bgPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const ideal = await sharp(idealPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = info.width;
const h = info.height;
const out = Buffer.from(data);
const idx = (x, y) => (y * w + x) * 4;

const SPINE_L = 72;
const SPINE_R = 208;
const SPINE_TOP = 476;
const SPINE_BOT = 595;
const FRONT_SAFE = 482;

// Ideal spine bounds (normalized)
const IL = 77;
const IR = 211;
const IT = 475;

const get = (buf, x, y) => {
  const i = idx(Math.max(0, Math.min(w - 1, x)), Math.max(0, Math.min(h - 1, y)));
  return [buf[i], buf[i + 1], buf[i + 2]];
};
const set = (x, y, r, g, b) => {
  const i = idx(x, y);
  out[i] = r;
  out[i + 1] = g;
  out[i + 2] = b;
  out[i + 3] = 255;
};

const toIdealX = (x) =>
  Math.round(IL + ((x - SPINE_L) * (IR - IL)) / (SPINE_R - SPINE_L));

// --- Tops: copy ideal cavity+soft tip for y=460..SPINE_TOP ---
// Ideal y = IT + (y - SPINE_TOP)
for (let y = 460; y <= SPINE_TOP; y++) {
  const iy = IT + (y - SPINE_TOP);
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const ix = toIdealX(x);
    const [ir, ig, ib] = get(ideal.data, ix, iy);
    if (y < SPINE_TOP) {
      // Above front face: full ideal (thin soft top / cavity)
      set(x, y, ir, ig, ib);
    } else {
      // y == SPINE_TOP: mostly keep our front white, light ideal blend at tip
      const [cr, cg, cb] = get(data, x, y);
      const bodyL = (cr + cg + cb) / 3;
      if (bodyL > 190) {
        set(
          x,
          y,
          Math.round(ir * 0.25 + cr * 0.75),
          Math.round(ig * 0.25 + cg * 0.75),
          Math.round(ib * 0.25 + cb * 0.75),
        );
      } else {
        set(x, y, ir, ig, ib);
      }
    }
  }
}

// Soften dark crease: if row SPINE_TOP-1 is much darker than neighbors, lift toward white tip
for (let x = SPINE_L; x <= SPINE_R; x++) {
  const y = SPINE_TOP - 1;
  const [r, g, b] = get(out, x, y);
  const [r2, g2, b2] = get(out, x, SPINE_TOP);
  const L = (r + g + b) / 3;
  const L2 = (r2 + g2 + b2) / 3;
  if (L2 - L > 40) {
    // too dark crease — blend toward front
    set(
      x,
      y,
      Math.round(r * 0.4 + r2 * 0.6),
      Math.round(g * 0.4 + g2 * 0.6),
      Math.round(b * 0.4 + b2 * 0.6),
    );
  }
}

// --- Book5 right: copy ideal soft falloff; kill thick wedge ---
for (let y = 460; y <= 530; y++) {
  const iy = IT + (y - SPINE_TOP);
  if (iy < 450 || iy > 590) continue;
  for (let x = SPINE_R; x <= 228; x++) {
    // x==SPINE_R: only soften outer edge for top band, don't rewrite front body lower down
    if (x === SPINE_R && y >= FRONT_SAFE) continue;

    const ix = toIdealX(x);
    const [ir, ig, ib] = get(ideal.data, ix, iy);

    if (x > SPINE_R) {
      set(x, y, ir, ig, ib);
    } else if (y < FRONT_SAFE) {
      // top few rows of rightmost front column — slight soften
      const [cr, cg, cb] = get(out, x, y);
      set(
        x,
        y,
        Math.round(cr * 0.7 + ir * 0.3),
        Math.round(cg * 0.7 + ig * 0.3),
        Math.round(cb * 0.7 + ib * 0.3),
      );
    }
  }
}

// Ensure region above tops to the right is clean ideal cavity
for (let y = 448; y < SPINE_TOP; y++) {
  const iy = Math.max(448, IT + (y - SPINE_TOP));
  for (let x = SPINE_R + 1; x <= 230; x++) {
    const [ir, ig, ib] = get(ideal.data, toIdealX(x), Math.min(474, iy));
    set(x, y, ir, ig, ib);
  }
}

fs.writeFileSync(
  bgPath,
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(),
);

let changed = 0;
let changedOutside = 0;
let bodyChanged = 0;
const allowed = (x, y) =>
  (x >= SPINE_L && x <= SPINE_R && y >= 448 && y <= SPINE_TOP) ||
  (x >= SPINE_R && x <= 230 && y >= 448 && y <= 530);

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    if (
      out[i] !== data[i] ||
      out[i + 1] !== data[i + 1] ||
      out[i + 2] !== data[i + 2]
    ) {
      changed++;
      if (!allowed(x, y)) changedOutside++;
      if (y >= FRONT_SAFE && y <= SPINE_BOT && x >= SPINE_L && x <= SPINE_R)
        bodyChanged++;
    }
  }
}

const lum = (buf, x, y) => {
  const [r, g, b] = get(buf, x, y);
  return (r + g + b) / 3;
};

console.log(
  JSON.stringify(
    {
      changed,
      changedOutside,
      bodyChanged,
      tops: [470, 472, 474, 475, 476, 478].map((y) => ({
        y,
        after: lum(out, 140, y) | 0,
        ideal: lum(ideal.data, toIdealX(140), IT + (y - SPINE_TOP)) | 0,
      })),
      side: [208, 210, 212, 215, 218].map((x) => ({
        x,
        after480: lum(out, x, 480) | 0,
        ideal480: lum(ideal.data, toIdealX(x), 480) | 0,
        after500: lum(out, x, 500) | 0,
        ideal500: lum(ideal.data, toIdealX(x), 500) | 0,
      })),
    },
    null,
    2,
  ),
);
