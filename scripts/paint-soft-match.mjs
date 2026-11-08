import sharp from "sharp";
import fs from "fs";

/**
 * Soft photographic match to ideal:
 * - shorter, lighter top ramp (less "dark lid")
 * - shorter, softer book5 side
 * - blur edit region only, then restore front body
 */

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;
const BODY_Y0 = 481;
const BODY_Y1 = 581;

// Lighter / shorter than previous — ideal looks pale & thin
const TOP_RAMP = [195, 175, 145, 110, 75, 45]; // 6px
const SIDE_RAMP = [195, 145, 95, 55, 30]; // 5px

function idx(x, y) {
  return (y * W + x) * 4;
}
function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function get(d, x, y) {
  const i = idx(x, y);
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}
function set(d, x, y, r, g, b, a = 255) {
  const i = idx(x, y);
  d[i] = Math.max(0, Math.min(255, Math.round(r)));
  d[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
  d[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  d[i + 3] = a;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

async function main() {
  const basePath = "public/images/ref/bg-before-softblur.png";
  const { data: raw } = await sharp(basePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const d = Buffer.from(raw);
  const base = Buffer.from(raw);

  let cr = 0,
    cg = 0,
    cb = 0,
    cn = 0;
  for (let y = 450; y <= 462; y++) {
    for (let x = SPINE_L; x <= SPINE_R + 20; x++) {
      const [r, g, b] = get(d, x, y);
      if (lum(r, g, b) < 55) {
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
  const cL = lum(cr, cg, cb);

  // Clear
  for (let y = 450; y < BODY_Y0; y++) {
    for (let x = SPINE_L; x <= SPINE_R + 20; x++) set(d, x, y, cr, cg, cb);
  }
  for (let y = BODY_Y0; y <= BODY_Y1; y++) {
    for (let x = SPINE_R + 1; x <= SPINE_R + 20; x++) set(d, x, y, cr, cg, cb);
  }

  const gutters = new Set([99, 126, 154, 181]);

  // Tops
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const [fr, fg, fb] = get(base, x, BODY_Y0);
    const fL = Math.max(1, lum(fr, fg, fb));
    const gutter = gutters.has(x);
    for (let k = 0; k < TOP_RAMP.length; k++) {
      const y = BODY_Y0 - 1 - k;
      let targetL = TOP_RAMP[k];
      if (gutter) targetL = lerp(targetL, cL, 0.4);
      const t = Math.max(0, Math.min(1, (fL - targetL) / (fL - cL)));
      set(d, x, y, lerp(fr, cr, t), lerp(fg, cg, t), lerp(fb, cb, t));
    }
  }

  // Side — on body + tops. At top rows, pull side toward cavity faster
  // to avoid triangular flare at TR corner.
  for (let y = BODY_Y0 - TOP_RAMP.length; y <= BODY_Y1; y++) {
    const [er, eg, eb] =
      y >= BODY_Y0 ? get(base, SPINE_R, y) : get(d, SPINE_R, y);
    const eL = Math.max(1, lum(er, eg, eb));
    const topFactor = y < BODY_Y0 ? 0.7 : 1.0; // thinner side near tops
    for (let dist = 1; dist <= SIDE_RAMP.length; dist++) {
      const x = SPINE_R + dist;
      let targetL = SIDE_RAMP[dist - 1] * topFactor;
      // Near TR corner, accelerate falloff
      if (y < BODY_Y0 && dist >= 3) targetL = Math.min(targetL, cL + 15);
      const t = Math.max(0, Math.min(1, (eL - targetL) / (eL - cL)));
      set(d, x, y, lerp(er, cr, t), lerp(eg, cg, t), lerp(eb, cb, t));
    }
    for (let x = SPINE_R + SIDE_RAMP.length + 1; x <= SPINE_R + 20; x++) {
      set(d, x, y, cr, cg, cb);
    }
  }

  // Write temp full image, blur ONLY a crop of edit region, paste back
  const tmpPaint = "public/images/ref/_paint_tmp.png";
  await sharp(d, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(tmpPaint);

  // Edit bbox: tops + side
  const ex = SPINE_L - 2;
  const ey = BODY_Y0 - TOP_RAMP.length - 4;
  const ew = SPINE_R + 20 - ex + 2;
  const eh = BODY_Y1 - ey + 1;

  const blurredRegion = await sharp(tmpPaint)
    .extract({ left: ex, top: ey, width: ew, height: eh })
    .blur(0.9)
    .png()
    .toBuffer();

  // Composite blurred region onto painted image
  const composed = await sharp(tmpPaint)
    .composite([{ input: blurredRegion, left: ex, top: ey }])
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Restore front body exactly from base
  const out = Buffer.from(composed);
  for (let y = BODY_Y0; y <= BODY_Y1; y++) {
    for (let x = SPINE_L; x <= SPINE_R; x++) {
      const i = idx(x, y);
      out[i] = base[i];
      out[i + 1] = base[i + 1];
      out[i + 2] = base[i + 2];
      out[i + 3] = base[i + 3];
    }
  }

  // Extra soften only the first row above front (crease) toward front color
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    if (gutters.has(x)) continue;
    const y = BODY_Y0 - 1;
    const [fr, fg, fb] = get(base, x, BODY_Y0);
    const [tr, tg, tb] = get(out, x, y);
    set(out, x, y, lerp(tr, fr, 0.35), lerp(tg, fg, 0.35), lerp(tb, fb, 0.35));
  }

  // Verify
  let bodyCh = 0;
  for (let y = BODY_Y0; y <= BODY_Y1; y++) {
    for (let x = SPINE_L; x <= SPINE_R; x++) {
      const i = idx(x, y);
      if (
        out[i] !== base[i] ||
        out[i + 1] !== base[i + 1] ||
        out[i + 2] !== base[i + 2]
      )
        bodyCh++;
    }
  }
  const inEdit = (x, y) => {
    if (x >= SPINE_L - 2 && x <= SPINE_R && y >= ey && y < BODY_Y0) return true;
    if (x >= SPINE_R + 1 && x <= SPINE_R + 20 && y >= ey && y <= BODY_Y1)
      return true;
    // blur may touch x SPINE_L-2..SPINE_L-1
    if (x >= SPINE_L - 2 && x < SPINE_L && y >= ey && y < BODY_Y0) return true;
    return false;
  };
  // Broader: anything changed outside spine tops/side is outCh
  let outCh = 0;
  const changed = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (
        out[i] === base[i] &&
        out[i + 1] === base[i + 1] &&
        out[i + 2] === base[i + 2]
      )
        continue;
      // allowed edit
      const allowed =
        (x >= SPINE_L && x <= SPINE_R && y >= 450 && y < BODY_Y0) ||
        (x >= SPINE_R + 1 && x <= SPINE_R + 20 && y >= 450 && y <= BODY_Y1) ||
        (x >= SPINE_L - 2 && x < SPINE_L && y >= 450 && y < BODY_Y0); // blur bleed
      if (!allowed) {
        outCh++;
        if (changed.length < 5) changed.push({ x, y });
      }
    }
  }
  console.log({ bodyCh, outCh, sampleOut: changed });

  const tmp = "public/images/shelf-background.tmp.png";
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(tmp);
  fs.renameSync(tmp, "public/images/shelf-background.png");
  try {
    fs.unlinkSync(tmpPaint);
  } catch {}

  // Profiles
  const mid = [];
  for (let y = 472; y <= 485; y++) {
    const [r, g, b] = get(out, 140, y);
    mid.push(`y${y}:${lum(r, g, b).toFixed(0)}`);
  }
  console.log("tops", mid.join(" "));
  const side = [];
  for (let x = 206; x <= 218; x++) {
    const [r, g, b] = get(out, x, 520);
    side.push(`x${x}:${lum(r, g, b).toFixed(0)}`);
  }
  console.log("side", side.join(" "));

  // Aligned compares
  async function crop(path, left, top, w, h, rw, rh) {
    return sharp(path)
      .extract({ left, top, width: w, height: h })
      .resize(rw, rh, { kernel: "lanczos3" })
      .png()
      .toBuffer();
  }

  const afterTops = await crop(
    "public/images/shelf-background.png",
    60,
    481 - 14,
    180,
    36,
    540,
    108
  );
  const idealTops = await crop(
    "public/images/ref/ideal-normalized-918.png",
    60,
    475 - 14,
    180,
    36,
    540,
    108
  );
  const afterB5 = await crop(
    "public/images/shelf-background.png",
    178,
    461,
    70,
    55,
    280,
    220
  );
  const idealB5 = await crop(
    "public/images/ref/ideal-normalized-918.png",
    182,
    455,
    70,
    55,
    280,
    220
  );

  await sharp(afterTops).toFile("public/images/ref/cmp-tone-after-tops.png");
  await sharp(idealTops).toFile("public/images/ref/cmp-tone-ideal-tops.png");
  await sharp(afterB5).toFile("public/images/ref/cmp-tone-after-book5.png");
  await sharp(idealB5).toFile("public/images/ref/cmp-tone-ideal-book5.png");

  const label = (t, w) =>
    Buffer.from(
      `<svg width="${w}" height="24"><text x="6" y="17" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
    );

  await sharp({
    create: {
      width: 1120,
      height: 150,
      channels: 3,
      background: { r: 18, g: 18, b: 18 },
    },
  })
    .composite([
      { input: label("AFTER tops", 540), top: 2, left: 10 },
      { input: label("IDEAL tops", 540), top: 2, left: 570 },
      { input: afterTops, top: 28, left: 10 },
      { input: idealTops, top: 28, left: 570 },
    ])
    .png()
    .toFile("public/images/ref/final-after-vs-ideal-tops.png");

  await sharp({
    create: {
      width: 580,
      height: 250,
      channels: 3,
      background: { r: 18, g: 18, b: 18 },
    },
  })
    .composite([
      { input: label("AFTER book5", 280), top: 2, left: 5 },
      { input: label("IDEAL book5", 280), top: 2, left: 295 },
      { input: afterB5, top: 28, left: 5 },
      { input: idealB5, top: 28, left: 295 },
    ])
    .png()
    .toFile("public/images/ref/final-after-vs-ideal-book5.png");

  // Side-by-side spine block for user
  const ab = await crop(
    "public/images/shelf-background.png",
    55,
    455,
    190,
    150,
    380,
    300
  );
  const ib = await crop(
    "public/images/ref/ideal-normalized-918.png",
    55,
    449,
    190,
    150,
    380,
    300
  );
  await sharp({
    create: {
      width: 780,
      height: 340,
      channels: 3,
      background: { r: 18, g: 18, b: 18 },
    },
  })
    .composite([
      { input: label("AFTER spines", 380), top: 4, left: 5 },
      { input: label("IDEAL spines", 380), top: 4, left: 395 },
      { input: ab, top: 30, left: 5 },
      { input: ib, top: 30, left: 395 },
    ])
    .png()
    .toFile("public/images/ref/final-after-vs-ideal-spines.png");

  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
