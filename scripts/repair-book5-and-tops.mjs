import sharp from "sharp";
import fs from "fs";

/**
 * 1) Remove old side remnant to the RIGHT/ABOVE of book 5
 * 2) Paint visible 3D top faces extending a few px toward shelf back (up in image)
 * Protect: front faces, numbers, bottom, book5 side below top zone
 */

const bgPath = "public/images/shelf-background.png";
const snapPath = "public/images/ref/bg-before-book5-tops.png";

const current = await sharp(bgPath).png().toBuffer();
fs.writeFileSync(snapPath, current);

const { data, info } = await sharp(bgPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = info.width;
const h = info.height;
const out = Buffer.from(data);
const idx = (x, y) => (y * w + x) * 4;

const SPINE_L = 72;
const SPINE_R = 208; // front face right edge of book 5
const SPINE_TOP = 476;
const SPINE_BOT = 595;
const bookW = (SPINE_R - SPINE_L + 1) / 5;

// --- 1) Erase remnant ABOVE tops and to the RIGHT of book 5 ---
// Remnant cluster: x≈209-219, y≈450-475 (sticks above current top)
const REM_X0 = 209;
const REM_X1 = 228;
const REM_Y0 = 448;
const REM_Y1 = SPINE_TOP - 1; // 475 — do not erase body side below top

function sampleCavity(x, y) {
  // Same-Y natural dark to the right of remnant
  const sx = 235 + ((x + y) % 20);
  const si = idx(Math.min(w - 1, sx), y);
  const sj = idx(Math.min(w - 1, sx + 1), y);
  return [
    Math.round(data[si] * 0.7 + data[sj] * 0.3),
    Math.round(data[si + 1] * 0.7 + data[sj + 1] * 0.3),
    Math.round(data[si + 2] * 0.7 + data[sj + 2] * 0.3),
  ];
}

for (let y = REM_Y0; y <= REM_Y1; y++) {
  for (let x = REM_X0; x <= REM_X1; x++) {
    const [r, g, b] = sampleCavity(x, y);
    const ti = idx(x, y);
    out[ti] = r;
    out[ti + 1] = g;
    out[ti + 2] = b;
    out[ti + 3] = 255;
  }
}

// Also scrub any leftover mid-tone blotches in cavity ABOVE all spines (x=72-208, y=450-475)
// if brighter than natural cavity (should be ~8-20)
for (let y = 450; y <= REM_Y1; y++) {
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const i = idx(x, y);
    const L = (out[i] + out[i + 1] + out[i + 2]) / 3;
    if (L > 35) {
      const [r, g, b] = sampleCavity(x, y);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
}

// Feather remnant clean into neighbors
for (let y = REM_Y0; y <= REM_Y1; y++) {
  for (let dx = 0; dx < 3; dx++) {
    const a = [0.5, 0.28, 0.12][dx];
    {
      const x = REM_X0 + dx;
      const ti = idx(x, y);
      // blend toward book5 right edge pixel (kept)
      const edge = idx(SPINE_R, y);
      // Prefer cavity if above tops
      const cav = sampleCavity(x, y);
      out[ti] = Math.round(out[ti] * (1 - a) + cav[0] * a);
      out[ti + 1] = Math.round(out[ti + 1] * (1 - a) + cav[1] * a);
      out[ti + 2] = Math.round(out[ti + 2] * (1 - a) + cav[2] * a);
    }
    {
      const x = REM_X1 - dx;
      const ti = idx(x, y);
      const dark = idx(Math.min(w - 1, REM_X1 + 4), y);
      out[ti] = Math.round(out[ti] * (1 - a) + data[dark] * a);
      out[ti + 1] = Math.round(out[ti + 1] * (1 - a) + data[dark + 1] * a);
      out[ti + 2] = Math.round(out[ti + 2] * (1 - a) + data[dark + 2] * a);
    }
  }
}

// Clean diagonal jut at book5 top-right corner: y=476-481, x=209-220
// Keep a SHORT natural side wedge only for y>=SPINE_TOP, tapering; erase anything that looks like old tall side
for (let y = SPINE_TOP; y <= SPINE_TOP + 6; y++) {
  for (let x = 209; x <= 222; x++) {
    const depth = x - SPINE_R; // 1..14
    const maxDepth = Math.max(1, 8 - (y - SPINE_TOP)); // side short near top, longer below
    const ti = idx(x, y);
    if (depth > maxDepth) {
      // outside natural side wedge → cavity
      const [r, g, b] = sampleCavity(x, Math.min(y, REM_Y1));
      // use same-Y cavity from x=230
      const si = idx(230, y);
      out[ti] = data[si];
      out[ti + 1] = data[si + 1];
      out[ti + 2] = data[si + 2];
      out[ti + 3] = 255;
    } else {
      // reshape side: soft gray depth face (not bright remnant)
      const t = depth / maxDepth;
      const shade = 165 - t * 40;
      out[ti] = Math.round(shade);
      out[ti + 1] = Math.round(shade - 2);
      out[ti + 2] = Math.round(shade - 5);
      out[ti + 3] = 255;
    }
  }
}

// --- 2) Visible 3D top faces: extend a few px toward shelf BACK (up = smaller y) ---
// Front face height unchanged: white body from SPINE_TOP+TOP_FRONT stays as-is for numbers.
// Tops occupy y = SPINE_TOP - TOP_DEPTH .. SPINE_TOP+1
const TOP_DEPTH = 5; // px into cavity (奥側)
const TOP_Y0 = SPINE_TOP - TOP_DEPTH; // 471
const TOP_Y1 = SPINE_TOP + 1; // 477 — soft join into front

for (let bi = 0; bi < 5; bi++) {
  const x0 = Math.round(SPINE_L + bi * bookW);
  const x1 = Math.round(SPINE_L + (bi + 1) * bookW) - 1;
  const width = x1 - x0 + 1;

  for (let y = TOP_Y0; y <= TOP_Y1; y++) {
    // 0 at back (奥), 1 at front edge
    const depthT = (y - TOP_Y0) / (TOP_Y1 - TOP_Y0);
    for (let x = x0; x <= x1; x++) {
      const localX = (x - x0) / Math.max(1, width - 1);
      const ti = idx(x, y);

      // Top face shading: darker at back, lighter toward front
      // Back (depthT~0): ~150 gray; Front (depthT~1): ~210 light gray
      let shade = 148 + depthT * 62 + localX * 6;

      // Soft highlight near front lip
      if (depthT > 0.7 && depthT < 0.95) shade += 8;

      // Book edge notches
      if (x === x0 || x === x1) shade *= 0.78;

      // At front rows that overlap existing white, blend so we don't erase front identity
      if (y >= SPINE_TOP) {
        const baseR = data[ti];
        const baseG = data[ti + 1];
        const baseB = data[ti + 2];
        const bodyL = (baseR + baseG + baseB) / 3;
        if (bodyL > 180) {
          // blend top into white front
          const a = y === SPINE_TOP ? 0.85 : 0.45;
          shade = shade * a + bodyL * (1 - a);
        }
      }

      let r = Math.round(shade);
      let g = Math.round(shade - 1);
      let b = Math.round(shade - 4);

      out[ti] = Math.min(255, r);
      out[ti + 1] = Math.min(255, g);
      out[ti + 2] = Math.min(255, b);
      out[ti + 3] = 255;
    }
  }

  // Separators on top face between books
  if (bi < 4) {
    const sepX = x1;
    for (let y = TOP_Y0; y <= TOP_Y1; y++) {
      const ti = idx(sepX, y);
      out[ti] = Math.round(out[ti] * 0.62);
      out[ti + 1] = Math.round(out[ti + 1] * 0.62);
      out[ti + 2] = Math.round(out[ti + 2] * 0.62);
    }
  }
}

// Book 5: connect top face to right side at corner
for (let y = TOP_Y0; y <= SPINE_TOP + 2; y++) {
  const depthT = (y - TOP_Y0) / (TOP_Y1 - TOP_Y0);
  const sideLen = Math.round(2 + depthT * 5); // longer side as we approach front
  for (let d = 1; d <= sideLen; d++) {
    const x = SPINE_R + d;
    if (x > 220) break;
    const ti = idx(x, y);
    const shade = 155 - d * 8 + depthT * 25;
    out[ti] = Math.round(shade);
    out[ti + 1] = Math.round(shade - 2);
    out[ti + 2] = Math.round(shade - 5);
    out[ti + 3] = 255;
  }
}

// Soft AA: top back edge into cavity
for (let x = SPINE_L; x <= SPINE_R; x++) {
  const ti = idx(x, TOP_Y0);
  const above = idx(x, TOP_Y0 - 1);
  const a = 0.35;
  out[ti] = Math.round(out[ti] * (1 - a) + out[above] * a);
  out[ti + 1] = Math.round(out[ti + 1] * (1 - a) + out[above + 1] * a);
  out[ti + 2] = Math.round(out[ti + 2] * (1 - a) + out[above + 2] * a);
}

fs.writeFileSync(
  bgPath,
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(),
);

// --- Verify ---
const allowed = (x, y) => {
  // remnant clean zone
  if (x >= REM_X0 - 1 && x <= REM_X1 + 4 && y >= REM_Y0 && y <= REM_Y1) return true;
  // top faces
  if (x >= SPINE_L && x <= SPINE_R + 12 && y >= TOP_Y0 - 1 && y <= TOP_Y1) return true;
  // book5 corner reshape
  if (x >= 209 && x <= 222 && y >= SPINE_TOP && y <= SPINE_TOP + 6) return true;
  // cavity scrub above spines
  if (x >= SPINE_L && x <= SPINE_R && y >= 450 && y <= REM_Y1) return true;
  return false;
};

let changed = 0;
let changedOutside = 0;
let bodyChanged = 0;
let remnantLeft = 0;

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    const diff =
      out[i] !== data[i] ||
      out[i + 1] !== data[i + 1] ||
      out[i + 2] !== data[i + 2];
    if (diff) {
      changed++;
      if (!allowed(x, y)) changedOutside++;
      // front body / numbers must stay
      if (y >= 482 && y <= SPINE_BOT && x >= SPINE_L && x <= SPINE_R) {
        bodyChanged++;
      }
    }
  }
}

// Remnant check: above tops, right of book5
for (let y = 450; y <= 475; y++) {
  for (let x = 209; x <= 220; x++) {
    const i = idx(x, y);
    const L = (out[i] + out[i + 1] + out[i + 2]) / 3;
    if (L > 40) remnantLeft++;
  }
}

const lum = (x, y) => {
  const i = idx(x, y);
  return (out[i] + out[i + 1] + out[i + 2]) / 3;
};

console.log(
  JSON.stringify(
    {
      changed,
      changedOutside,
      bodyChanged,
      remnantLeft,
      topProfile: [468, 471, 473, 475, 476, 478, 482].map((y) => ({
        y,
        b1: lum(85, y) | 0,
        b3: lum(140, y) | 0,
        b5: lum(195, y) | 0,
        right: lum(215, y) | 0,
      })),
    },
    null,
    2,
  ),
);
