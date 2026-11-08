import sharp from "sharp";
import fs from "fs";

/**
 * Match ideal CHARACTER via luminance profiles, anchored to THIS bg's
 * spine fronts (x=72..208, y>=482). No ideal pixel copy (misaligned).
 */

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;
// Front face top row is y=481 (measured). Protect y>=481 for x in [SPINE_L,SPINE_R].
const BODY_Y0 = 481;
const BODY_Y1 = 581;

// Ideal top ramp relative to front-top (from ideal scan at book centers).
// Ideal frontTop≈475: y474=160,473=124,472=102,471=88,470=78,469=68,468=59,467=38,466≈20
const TOP_RAMP = [160, 124, 102, 88, 78, 68, 59, 38]; // index 0 = 1px above front

// Ideal book5 right falloff relative to front-right edge (ideal white ends ~212,
// falloff 213..219). Scaled to start just right of our SPINE_R=208.
// Ideal: 189,159,142,122,100,81,48 then cavity
const SIDE_RAMP = [185, 155, 130, 105, 82, 58, 36]; // dist 1..7

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
function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

async function main() {
  const basePath = "public/images/ref/bg-before-softblur.png";
  const { data: raw } = await sharp(basePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const d = Buffer.from(raw);
  const base = Buffer.from(raw);

  // Cavity
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
  console.log("cavity", cr.toFixed(1), cg.toFixed(1), cb.toFixed(1), "L", cL.toFixed(1));

  // Clear tops zone + book5 side strip
  for (let y = 450; y < BODY_Y0; y++) {
    for (let x = SPINE_L; x <= SPINE_R + 20; x++) set(d, x, y, cr, cg, cb);
  }
  for (let y = BODY_Y0; y <= BODY_Y1; y++) {
    for (let x = SPINE_R + 1; x <= SPINE_R + 20; x++) set(d, x, y, cr, cg, cb);
  }

  // Gutters between books (approx)
  const gutters = new Set([99, 126, 154, 181]);

  // Paint tops: target luminance from TOP_RAMP, chromaticity from front/cavity mix
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const [fr, fg, fb] = get(base, x, BODY_Y0 + 1);
    const fL = Math.max(1, lum(fr, fg, fb));
    const isGutter = gutters.has(x);

    for (let k = 0; k < TOP_RAMP.length; k++) {
      const y = BODY_Y0 - 1 - k; // k=0 → y=481
      if (y < 450) continue;
      let targetL = TOP_RAMP[k];
      if (isGutter) targetL = lerp(targetL, cL, 0.45);

      // Blend front color toward cavity by luminance
      const t = Math.max(0, Math.min(1, (fL - targetL) / (fL - cL)));
      const r = lerp(fr, cr, t);
      const g = lerp(fg, cg, t);
      const b = lerp(fb, cb, t);
      set(d, x, y, r, g, b);
    }
    // one more soft fade px
    {
      const y = BODY_Y0 - 1 - TOP_RAMP.length;
      if (y >= 450) {
        const targetL = lerp(TOP_RAMP[TOP_RAMP.length - 1], cL, 0.55);
        const t = Math.max(0, Math.min(1, (fL - targetL) / (fL - cL)));
        set(d, x, y, lerp(fr, cr, t), lerp(fg, cg, t), lerp(fb, cb, t));
      }
    }
  }

  // Light horizontal soften on tops (preserve profile)
  const soft = Buffer.from(d);
  for (let y = BODY_Y0 - TOP_RAMP.length - 1; y < BODY_Y0; y++) {
    for (let x = SPINE_L + 1; x < SPINE_R; x++) {
      if (gutters.has(x)) continue;
      const a = get(d, x - 1, y);
      const b = get(d, x, y);
      const c = get(d, x + 1, y);
      set(
        soft,
        x,
        y,
        a[0] * 0.2 + b[0] * 0.6 + c[0] * 0.2,
        a[1] * 0.2 + b[1] * 0.6 + c[1] * 0.2,
        a[2] * 0.2 + b[2] * 0.6 + c[2] * 0.2
      );
    }
  }
  soft.copy(d);

  // Book5 right side — soft ideal-like falloff, no thick panel
  for (let y = BODY_Y0 - TOP_RAMP.length - 1; y <= BODY_Y1; y++) {
    const edge =
      y >= BODY_Y0 ? get(base, SPINE_R, y) : get(d, Math.min(SPINE_R, SPINE_R), y);
    // For tops rows use painted top at spine_r
    const [er, eg, eb] =
      y >= BODY_Y0 ? get(base, SPINE_R, y) : get(d, SPINE_R, y);
    const eL = Math.max(1, lum(er, eg, eb));

    for (let dist = 1; dist <= SIDE_RAMP.length; dist++) {
      const x = SPINE_R + dist;
      let targetL = SIDE_RAMP[dist - 1];
      // At top rows, darken side a bit more (ideal tops side is darker)
      if (y < BODY_Y0) targetL *= 0.92;
      const t = Math.max(0, Math.min(1, (eL - targetL) / (eL - cL)));
      set(d, x, y, lerp(er, cr, t), lerp(eg, cg, t), lerp(eb, cb, t));
    }
    for (let x = SPINE_R + SIDE_RAMP.length + 1; x <= SPINE_R + 20; x++) {
      set(d, x, y, cr, cg, cb);
    }
  }

  // Soften TR corner of book5 (3x3) without touching front body
  for (let pass = 0; pass < 2; pass++) {
    const src = Buffer.from(d);
    for (let y = BODY_Y0 - 4; y <= BODY_Y0 + 3; y++) {
      for (let x = SPINE_R - 1; x <= SPINE_R + 4; x++) {
        if (y >= BODY_Y0 && x <= SPINE_R) continue;
        let rs = 0,
          gs = 0,
          bs = 0,
          n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            let p;
            if (yy >= BODY_Y0 && xx <= SPINE_R) p = get(base, xx, yy);
            else p = get(src, xx, yy);
            rs += p[0];
            gs += p[1];
            bs += p[2];
            n++;
          }
        }
        set(d, x, y, rs / n, gs / n, bs / n);
      }
    }
  }

  // Verify
  let bodyCh = 0;
  for (let y = BODY_Y0; y <= BODY_Y1; y++) {
    for (let x = SPINE_L; x <= SPINE_R; x++) {
      const i = idx(x, y);
      if (d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2])
        bodyCh++;
    }
  }
  const inEdit = (x, y) => {
    if (x >= SPINE_L && x <= SPINE_R && y >= 450 && y < BODY_Y0) return true;
    if (x >= SPINE_R + 1 && x <= SPINE_R + 20 && y >= 450 && y <= BODY_Y1)
      return true;
    return false;
  };
  let outCh = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (inEdit(x, y)) continue;
      const i = idx(x, y);
      if (d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2])
        outCh++;
    }
  }

  // Also count change vs previous shelf-background for report
  let prevCh = 0;
  if (fs.existsSync("public/images/shelf-background.png")) {
    const prev = await sharp("public/images/shelf-background.png")
      .ensureAlpha()
      .raw()
      .toBuffer();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] !== prev[i] || d[i + 1] !== prev[i + 1] || d[i + 2] !== prev[i + 2])
        prevCh++;
    }
  }
  console.log({ bodyCh, outCh, prevCh });

  const tmp = "public/images/shelf-background.tmp.png";
  await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
  fs.renameSync(tmp, "public/images/shelf-background.png");

  // Profile check
  const mid = [];
  for (let y = 470; y <= 485; y++) {
    const [r, g, b] = get(d, 140, y);
    mid.push(`y${y}:${lum(r, g, b).toFixed(0)}`);
  }
  console.log("tops mid", mid.join(" "));
  const side = [];
  for (let x = 205; x <= 220; x++) {
    const [r, g, b] = get(d, x, 520);
    side.push(`x${x}:${lum(r, g, b).toFixed(0)}`);
  }
  console.log("side y520", side.join(" "));

  // Aligned compares: crop relative to each image's own front-top
  async function spineTopCrop(path, frontTop, out) {
    // tops window: 14px above front, 8px into front; x 60..240
    const top = frontTop - 14;
    const buf = await sharp(path)
      .extract({ left: 60, top, width: 180, height: 36 })
      .resize(540, 108, { kernel: "lanczos3" })
      .png()
      .toBuffer();
    await sharp(buf).toFile(out);
    return buf;
  }
  async function book5Crop(path, frontTop, spineR, out) {
    const top = frontTop - 20;
    const left = spineR - 30;
    const buf = await sharp(path)
      .extract({ left, top, width: 70, height: 55 })
      .resize(280, 220, { kernel: "lanczos3" })
      .png()
      .toBuffer();
    await sharp(buf).toFile(out);
    return buf;
  }

  const afterTops = await spineTopCrop(
    "public/images/shelf-background.png",
    481,
    "public/images/ref/cmp-tone-after-tops.png"
  );
  const idealTops = await spineTopCrop(
    "public/images/ref/ideal-normalized-918.png",
    475,
    "public/images/ref/cmp-tone-ideal-tops.png"
  );
  const afterB5 = await book5Crop(
    "public/images/shelf-background.png",
    481,
    208,
    "public/images/ref/cmp-tone-after-book5.png"
  );
  const idealB5 = await book5Crop(
    "public/images/ref/ideal-normalized-918.png",
    475,
    212,
    "public/images/ref/cmp-tone-ideal-book5.png"
  );

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
      { input: label("AFTER tops (aligned)", 540), top: 2, left: 10 },
      { input: label("IDEAL tops (aligned)", 540), top: 2, left: 570 },
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

  // Full spine block vs ideal (absolute coords — ideal has cover to the right)
  await sharp("public/images/shelf-background.png")
    .extract({ left: 55, top: 455, width: 200, height: 155 })
    .resize(400, 310, { kernel: "lanczos3" })
    .png()
    .toFile("public/images/ref/cmp-after-spine-block.png");

  // Ideal spine-only: crop to spines then pad
  await sharp("public/images/ref/ideal-normalized-918.png")
    .extract({ left: 55, top: 449, width: 200, height: 155 })
    .resize(400, 310, { kernel: "lanczos3" })
    .png()
    .toFile("public/images/ref/cmp-ideal-spine-block.png");

  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
