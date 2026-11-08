import sharp from "sharp";
import fs from "fs";

/**
 * Create shelf-background-navy-leather.png from protected white spines.
 * Does NOT modify shelf-background.png or shelf-background-white-spines.png.
 */

const W = 1024;
const H = 664;
const WHITE_SRC = "public/images/shelf-background-white-spines.png";
const TEX_SRC = "public/images/ref/leather-navy-texture.png";
const OUT = "public/images/shelf-background-navy-leather.png";

const NAVY = { r: 30, g: 42, b: 68 }; // #1e2a44

/** Book front ranges + shared gap columns (from white mid-body scan) */
const BOOKS = [
  { id: 0, x0: 72, x1: 98, ox: 17, oy: 41 },
  { id: 1, x0: 100, x1: 126, ox: 63, oy: 11 },
  { id: 2, x0: 128, x1: 154, ox: 101, oy: 77 },
  { id: 3, x0: 156, x1: 181, ox: 29, oy: 53 },
  { id: 4, x0: 183, x1: 212, ox: 88, oy: 19 }, // includes thin right side
];
const GAPS = [99, 127, 155, 182];
const Y0 = 470;
const Y1 = 597;

const { data: whiteData, info: whiteInfo } = await sharp(WHITE_SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (whiteInfo.width !== W || whiteInfo.height !== H) {
  throw new Error(`Unexpected white size ${whiteInfo.width}x${whiteInfo.height}`);
}

const texMeta = await sharp(TEX_SRC).metadata();
const tw = texMeta.width;
const th = texMeta.height;
const { data: texData } = await sharp(TEX_SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const out = Buffer.from(whiteData);

function idx(x, y) {
  return (y * W + x) * 4;
}
function get(buf, x, y, bw = W) {
  const i = (y * bw + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function set(x, y, r, g, b) {
  const i = idx(x, y);
  out[i] = Math.max(0, Math.min(255, Math.round(r)));
  out[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
  out[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  out[i + 3] = 255;
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function sat(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function bookAt(x) {
  for (const b of BOOKS) {
    if (x >= b.x0 && x <= b.x1) return b;
  }
  return null;
}

function texSample(u, v) {
  // wrap
  let x = ((u % tw) + tw) % tw;
  let y = ((v % th) + th) % th;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % tw;
  const y1 = (y0 + 1) % th;
  const fx = x - x0;
  const fy = y - y0;
  const c00 = get(texData, x0, y0, tw);
  const c10 = get(texData, x1, y0, tw);
  const c01 = get(texData, x0, y1, tw);
  const c11 = get(texData, x1, y1, tw);
  const r =
    lerp(lerp(c00[0], c10[0], fx), lerp(c01[0], c11[0], fx), fy);
  const g =
    lerp(lerp(c00[1], c10[1], fx), lerp(c01[1], c11[1], fx), fy);
  const b =
    lerp(lerp(c00[2], c10[2], fx), lerp(c01[2], c11[2], fx), fy);
  return lum(r, g, b) / 255;
}

/** Map texture luminance → subtle navy variation around #1e2a44 */
function navyFromTex(t, shade = 1) {
  // t ~0..1; keep variation modest for calm luxury
  const centered = (t - 0.45) * 0.55; // subtle
  const m = clamp(0.92 + centered, 0.72, 1.12) * shade;
  return {
    r: clamp(NAVY.r * m, 0, 255),
    g: clamp(NAVY.g * m, 0, 255),
    b: clamp(NAVY.b * m * 1.02, 0, 255), // slight cool bias
  };
}

// Precompute local shading from white (preserve soft top shadow)
function localShade(x, y) {
  const [r, g, b] = get(whiteData, x, y);
  const L = lum(r, g, b);
  // white face ~220, tops ~100-190, side ~150-210, seams ~80
  return clamp(L / 220, 0.55, 1.05);
}

let painted = 0;
let gapPainted = 0;

for (let y = Y0; y <= Y1; y++) {
  for (let x = 68; x <= 216; x++) {
    const [wr, wg, wb] = get(whiteData, x, y);
    const wL = lum(wr, wg, wb);
    const wSat = sat(wr, wg, wb);

    // Shelf / cavity: leave untouched
    const onShelfBand = y >= 596 && wL < 160 && wSat < 0.25 && wr > wb;
    if (onShelfBand && x < 209) {
      // bottom contact of books blends — still paint book feet if mid-high L was book
    }

    const isGap = GAPS.includes(x);
    const book = bookAt(x);

    // Bookness: white/gray face, pale side, OR colored number glyphs
    const isNumberInk = wSat > 0.18 && wL > 60 && wL < 210 && book;
    const isBookSurface =
      book &&
      ((wL > 95 && wSat < 0.22) || isNumberInk || (x >= 209 && wL > 55 && wL < 220));

    // Tops / foot AA included when mid-gray in book columns
    const inTopBand = y >= Y0 && y < 481 && book && wL > 35;
    const inFoot = y >= 593 && y <= 597 && book && wL > 40;

    if (isGap && y >= 476 && y <= 595 && wL < 200) {
      // Dark navy seam between volumes (keep 5 distinct books)
      const shade = clamp(localShade(x - 1, y) * 0.72, 0.55, 0.85);
      const c = navyFromTex(0.35, shade);
      // Soft blend if gap was AA
      const t = clamp((180 - wL) / 120, 0.35, 1);
      set(
        x,
        y,
        lerp(wr, c.r, t),
        lerp(wg, c.g, t),
        lerp(wb, c.b, t)
      );
      gapPainted++;
      continue;
    }

    if (!isBookSurface && !inTopBand && !inFoot) continue;
    if (!book) continue;

    // Skip deep cavity right of book5
    if (x >= 213 && wL < 45) continue;

    // Texture coords: scale down pebbles for thin spines; unique offset per book
    const scale = 0.42; // denser, finer grain on spine
    const u = (x - book.x0) / scale + book.ox * 3.1;
    const v = (y - Y0) / scale + book.oy * 2.7;
    let t = texSample(u, v);

    // Micro variation so adjacent books don't look stamped identical
    t = clamp(t + ((book.id * 17 + x * 3 + y) % 7) * 0.004 - 0.012, 0, 1);

    let shade = localShade(x, y);
    // Top face slightly darker
    if (y < 481) shade *= 0.88;
    // Book5 right side (x>=209) a touch darker
    if (book.id === 4 && x >= 209) shade *= 0.82;
    // Outer AA toward cavity: darker
    if (book.id === 4 && x >= 211) shade *= 0.9;

    const navy = navyFromTex(t, shade);

    // Blend strength: full on solid face; soft on AA edges
    let alpha = 1;
    if (wL < 120 && !isNumberInk) alpha = clamp((wL - 40) / 80, 0.4, 1);
    if (y >= 596) alpha *= 0.85; // soft foot
    // Number ink: always fully cover (no white/gold ghost)
    if (isNumberInk) alpha = 1;

    set(
      x,
      y,
      lerp(wr, navy.r, alpha),
      lerp(wg, navy.g, alpha),
      lerp(wb, navy.b, alpha)
    );
    painted++;
  }
}

// Second pass: scrub residual bright/number pixels inside book fronts
for (let y = 500; y <= 590; y++) {
  for (const book of BOOKS) {
    for (let x = book.x0; x <= Math.min(book.x1, 208); x++) {
      const [r, g, b] = get(out, x, y);
      const L = lum(r, g, b);
      const s = sat(r, g, b);
      // leftover pale or chromatic glyph
      if (L > 110 || s > 0.2) {
        const scale = 0.42;
        const u = (x - book.x0) / scale + book.ox * 3.1;
        const v = (y - Y0) / scale + book.oy * 2.7;
        const navy = navyFromTex(texSample(u, v), localShade(x, y) * 0.98);
        set(x, y, navy.r, navy.g, navy.b);
      }
    }
  }
}

// Ensure white spine file untouched — write only OUT
const tmp = OUT + ".tmp.png";
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, OUT);

// Verify white files unchanged (hash size)
const whiteStat = fs.statSync(WHITE_SRC).size;
const mainStat = fs.statSync("public/images/shelf-background.png").size;
console.log({
  painted,
  gapPainted,
  out: OUT,
  whiteBytes: whiteStat,
  mainBytes: mainStat,
  outBytes: fs.statSync(OUT).size,
});

// Quick crops for visual QA
await sharp(OUT)
  .extract({ left: 60, top: 460, width: 170, height: 150 })
  .png()
  .toFile("public/images/ref/navy-spines-crop.png");
await sharp(OUT)
  .extract({ left: 175, top: 470, width: 50, height: 140 })
  .resize(250, 700, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/navy-book5-zoom.png");

console.log("done");
