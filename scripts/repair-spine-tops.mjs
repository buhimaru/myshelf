import sharp from "sharp";
import fs from "fs";

/**
 * Local repair only — remnants above spines + subtle 3D tops.
 * Bounds unchanged: L72 R208 top476 bot595. Body/numbers untouched.
 */

const bgPath = "public/images/shelf-background.png";
const snapshotPath = "public/images/ref/bg-before-top-repair.png";

const srcPath = fs.existsSync(snapshotPath) ? snapshotPath : bgPath;

const { data, info } = await sharp(srcPath)
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
const TOP_FACE_H = 5;

const CLEAN_X0 = 70;
const CLEAN_X1 = 212;
const CLEAN_Y0 = 450;
const CLEAN_Y1 = SPINE_TOP - 1;

// Natural cavity donor: same Y, to the right of spines (empty dark bay)
const DONOR_X0 = 220;
const DONOR_X1 = 280;

function sampleNaturalCavity(x, y) {
  // Map x into donor band, keep same y for lighting continuity
  const span = DONOR_X1 - DONOR_X0;
  const sx = DONOR_X0 + ((x - CLEAN_X0) % span);
  const si = idx(sx, y);
  // Slight mix with neighbor for less tiling
  const sx2 = Math.min(DONOR_X1, sx + 1);
  const sj = idx(sx2, y);
  return [
    Math.round(data[si] * 0.65 + data[sj] * 0.35),
    Math.round(data[si + 1] * 0.65 + data[sj + 1] * 0.35),
    Math.round(data[si + 2] * 0.65 + data[sj + 2] * 0.35),
  ];
}

// 1) Clean cavity by cloning natural same-Y dark wood
for (let y = CLEAN_Y0; y <= CLEAN_Y1; y++) {
  for (let x = CLEAN_X0; x <= CLEAN_X1; x++) {
    const [r, g, b] = sampleNaturalCavity(x, y);
    const ti = idx(x, y);
    out[ti] = r;
    out[ti + 1] = g;
    out[ti + 2] = b;
    out[ti + 3] = 255;
  }
}

// Soft horizontal blend at clean edges into real neighbors
for (let y = CLEAN_Y0; y <= CLEAN_Y1; y++) {
  for (let dx = 0; dx < 4; dx++) {
    const a = [0.6, 0.4, 0.22, 0.1][dx];
    {
      const x = CLEAN_X0 + dx;
      const ti = idx(x, y);
      const wall = idx(Math.max(0, CLEAN_X0 - 4), y);
      out[ti] = Math.round(out[ti] * (1 - a) + data[wall] * a);
      out[ti + 1] = Math.round(out[ti + 1] * (1 - a) + data[wall + 1] * a);
      out[ti + 2] = Math.round(out[ti + 2] * (1 - a) + data[wall + 2] * a);
    }
    {
      const x = CLEAN_X1 - dx;
      const ti = idx(x, y);
      const dark = idx(Math.min(w - 1, CLEAN_X1 + 4), y);
      out[ti] = Math.round(out[ti] * (1 - a) + data[dark] * a);
      out[ti + 1] = Math.round(out[ti + 1] * (1 - a) + data[dark + 1] * a);
      out[ti + 2] = Math.round(out[ti + 2] * (1 - a) + data[dark + 2] * a);
    }
  }
}

// Scrub leftover bright tip remnants just above clean band
for (let y = 448; y <= 449; y++) {
  for (let x = CLEAN_X0; x <= CLEAN_X1; x++) {
    const i = idx(x, y);
    const L = (out[i] + out[i + 1] + out[i + 2]) / 3;
    if (L > 45) {
      const [r, g, b] = sampleNaturalCavity(x, Math.max(CLEAN_Y0, y));
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
}

// 2) Goal-like light-gray top faces (within existing spine top only)
const bookW = (SPINE_R - SPINE_L + 1) / 5;

for (let bi = 0; bi < 5; bi++) {
  const x0 = Math.round(SPINE_L + bi * bookW);
  const x1 = Math.round(SPINE_L + (bi + 1) * bookW) - 1;
  const width = x1 - x0 + 1;

  for (let y = 0; y < TOP_FACE_H; y++) {
    const py = SPINE_TOP + y;
    for (let x = x0; x <= x1; x++) {
      const localX = (x - x0) / Math.max(1, width - 1);
      // Depth: front of top face is lower y (toward viewer) = larger y index
      const depth = localX; // slight L→R lighting
      const ti = idx(x, py);
      const baseR = data[ti];
      const baseG = data[ti + 1];
      const baseB = data[ti + 2];
      const bodyL = (baseR + baseG + baseB) / 3;

      let r, g, b;
      if (y === 0) {
        // far edge (back of book top) — darker
        r = 160 + depth * 8;
        g = 157 + depth * 8;
        b = 152 + depth * 8;
      } else if (y === 1) {
        // top face mid
        r = 200 + depth * 6;
        g = 198 + depth * 6;
        b = 194 + depth * 6;
      } else if (y === 2) {
        // top face front (brightest lid)
        r = 212 + depth * 4;
        g = 210 + depth * 4;
        b = 206 + depth * 4;
      } else if (y === 3) {
        // soft shadow under lid onto white spine
        r = Math.round(baseR * 0.82);
        g = Math.round(baseG * 0.82);
        b = Math.round(baseB * 0.82);
      } else {
        r = baseR;
        g = baseG;
        b = baseB;
      }

      // Per-book corner notches
      if ((x === x0 || x === x1) && y <= 2) {
        r = Math.round(r * 0.7);
        g = Math.round(g * 0.7);
        b = Math.round(b * 0.7);
      }

      // Keep book-5 side panel
      if (bodyL < 120) {
        r = Math.round(baseR * 0.82 + r * 0.18);
        g = Math.round(baseG * 0.82 + g * 0.18);
        b = Math.round(baseB * 0.82 + b * 0.18);
      }

      out[ti] = Math.min(255, Math.round(r));
      out[ti + 1] = Math.min(255, Math.round(g));
      out[ti + 2] = Math.min(255, Math.round(b));
      out[ti + 3] = 255;
    }
  }

  if (bi < 4) {
    const sepX = x1;
    for (let y = SPINE_TOP; y < SPINE_TOP + 4; y++) {
      const ti = idx(sepX, y);
      out[ti] = Math.round(out[ti] * 0.62);
      out[ti + 1] = Math.round(out[ti + 1] * 0.62);
      out[ti + 2] = Math.round(out[ti + 2] * 0.62);
    }
  }
}

// Tiny AA at cavity/top junction
for (let x = SPINE_L; x <= SPINE_R; x++) {
  const ti = idx(x, SPINE_TOP);
  const above = idx(x, SPINE_TOP - 1);
  const a = 0.12;
  out[ti] = Math.round(out[ti] * (1 - a) + out[above] * a);
  out[ti + 1] = Math.round(out[ti + 1] * (1 - a) + out[above + 1] * a);
  out[ti + 2] = Math.round(out[ti + 2] * (1 - a) + out[above + 2] * a);
}

fs.writeFileSync(
  bgPath,
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(),
);

const allowed = (x, y) =>
  x >= CLEAN_X0 - 4 &&
  x <= CLEAN_X1 + 4 &&
  y >= 448 &&
  y <= SPINE_TOP + TOP_FACE_H - 1;

let changed = 0;
let changedOutside = 0;
let bodyChanged = 0;
let brightAbove = 0;
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
      if (y >= 482 && y <= SPINE_BOT && x >= SPINE_L && x <= SPINE_R) {
        bodyChanged++;
      }
    }
    if (
      y >= CLEAN_Y0 &&
      y <= CLEAN_Y1 &&
      x >= SPINE_L &&
      x <= SPINE_R
    ) {
      const L = (out[i] + out[i + 1] + out[i + 2]) / 3;
      if (L > 40) brightAbove++;
    }
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
      brightAbove,
      cavitySample: [450, 460, 470, 475].map((y) => ({
        y,
        fill: lum(140, y) | 0,
        natural: lum(240, y) | 0,
      })),
      tops: [476, 477, 478, 479, 480].map((y) => lum(140, y) | 0),
    },
    null,
    2,
  ),
);
