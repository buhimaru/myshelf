import sharp from "sharp";
import fs from "fs";

/**
 * Paint subtle tops + soft book5 right side to match ideal CHARACTER,
 * anchored to THIS background's spine fronts (no ideal-pixel copy → no misalignment).
 *
 * Protect: front face x∈[72,208], y∈[482,581] exactly unchanged from base.
 */

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;
const BODY_Y0 = 482;
const BODY_Y1 = 581;

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
  // Start from pre-blur (best known), then clear tops zone and repaint
  const basePath = "public/images/ref/bg-before-softblur.png";
  fs.copyFileSync(basePath, "public/images/ref/bg-before-paint-subtle.png");

  const { data: raw } = await sharp(basePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const d = Buffer.from(raw);
  const base = Buffer.from(raw);

  // Cavity color from dark area above spines
  let cr = 0,
    cg = 0,
    cb = 0,
    cn = 0;
  for (let y = 450; y <= 462; y++) {
    for (let x = SPINE_L; x <= SPINE_R + 16; x++) {
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
  console.log("cavity", cr.toFixed(1), cg.toFixed(1), cb.toFixed(1));

  // Front face color samples just below BODY_Y0
  let fr = 0,
    fg = 0,
    fb = 0,
    fn = 0;
  for (let y = BODY_Y0; y <= BODY_Y0 + 8; y++) {
    for (let x = SPINE_L + 2; x <= SPINE_R - 2; x++) {
      const [r, g, b] = get(d, x, y);
      if (lum(r, g, b) > 180) {
        fr += r;
        fg += g;
        fb += b;
        fn++;
      }
    }
  }
  fr /= fn;
  fg /= fn;
  fb /= fn;
  console.log("front", fr.toFixed(1), fg.toFixed(1), fb.toFixed(1));

  // Detect per-column front top: first y ascending from BODY_Y0-1 where L>190
  // Actually front starts at BODY_Y0 by contract. Tops live in y < BODY_Y0.
  // Ideal profile (from earlier scan): soft ramp ~6–8px above white, peaking near white then slight dip.
  // Ideal-like ramp (relative to front top edge Yf = BODY_Y0):
  //   y = Yf-1 .. Yf-2 : near-front tip (slightly darker than front) ~210
  //   y = Yf-3 .. Yf-6 : mid top gray ramp ~130→70
  //   y = Yf-7 .. Yf-12: fade to cavity
  // Keep VERY thin: only ~3–4px of visible top gray, rest cavity.

  const TOP_VISIBLE = 3; // px of visible top surface (ideal is very thin)
  const FADE = 4; // px fade into cavity above that

  // Clear tops + near cavity above spines (and book5 side strip)
  for (let y = 450; y < BODY_Y0; y++) {
    for (let x = SPINE_L; x <= SPINE_R + 16; x++) {
      set(d, x, y, cr, cg, cb);
    }
  }
  // Clear exaggerated book5 side on body height
  for (let y = BODY_Y0; y <= BODY_Y1; y++) {
    for (let x = SPINE_R + 1; x <= SPINE_R + 16; x++) {
      set(d, x, y, cr, cg, cb);
    }
  }

  // Paint uniform thin tops across all 5 books
  // Also restore subtle vertical gutters between books from base at body — tops get soft gutters too
  // Book boundaries approx every ~27px: 72, 99, 126, 154, 181, 208
  const gutters = [99, 126, 154, 181];

  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const isGutter = gutters.some((g) => Math.abs(x - g) <= 0);
    // Sample local front color at this column
    const [lr, lg, lb] = get(base, x, BODY_Y0 + 2);
    const localFront =
      lum(lr, lg, lb) > 150
        ? [lr, lg, lb]
        : [fr, fg, fb];

    for (let k = 1; k <= TOP_VISIBLE + FADE; k++) {
      const y = BODY_Y0 - k;
      if (y < 450) continue;

      let t;
      if (k <= TOP_VISIBLE) {
        // k=1 nearest front: almost white tip; k=TOP_VISIBLE: mid-gray top
        t = (k - 1) / Math.max(1, TOP_VISIBLE - 1); // 0..1
        // tip slightly below front brightness, then to soft top gray
        const tipR = lerp(localFront[0], 200, 0.15);
        const tipG = lerp(localFront[1], 195, 0.15);
        const tipB = lerp(localFront[2], 190, 0.15);
        const topR = 165;
        const topG = 155;
        const topB = 145;
        const r = lerp(tipR, topR, smoothstep(t));
        const g = lerp(tipG, topG, smoothstep(t));
        const b = lerp(tipB, topB, smoothstep(t));
        if (isGutter) {
          set(d, x, y, lerp(r, cr, 0.55), lerp(g, cg, 0.55), lerp(b, cb, 0.55));
        } else {
          set(d, x, y, r, g, b);
        }
      } else {
        // fade to cavity
        const u = (k - TOP_VISIBLE) / FADE; // 0..1
        const topR = 165,
          topG = 155,
          topB = 145;
        const r = lerp(topR, cr, smoothstep(u));
        const g = lerp(topG, cg, smoothstep(u));
        const b = lerp(topB, cb, smoothstep(u));
        set(d, x, y, r, g, b);
      }
    }
  }

  // Soft 1px horizontal blend on tops
  const soft = Buffer.from(d);
  for (let y = BODY_Y0 - (TOP_VISIBLE + FADE); y < BODY_Y0; y++) {
    for (let x = SPINE_L + 1; x < SPINE_R; x++) {
      const a = get(d, x - 1, y);
      const b = get(d, x, y);
      const c = get(d, x + 1, y);
      set(
        soft,
        x,
        y,
        a[0] * 0.25 + b[0] * 0.5 + c[0] * 0.25,
        a[1] * 0.25 + b[1] * 0.5 + c[1] * 0.25,
        a[2] * 0.25 + b[2] * 0.5 + c[2] * 0.25,
        b[3]
      );
    }
  }
  soft.copy(d);

  // Book5 right side: very soft, short falloff (ideal barely shows side)
  // Width ~3–4px max, darkening quickly
  for (let y = BODY_Y0 - (TOP_VISIBLE + FADE); y <= BODY_Y1; y++) {
    // Get edge color from front at x=SPINE_R
    const [er, eg, eb] = get(
      y >= BODY_Y0 ? base : d,
      SPINE_R,
      y >= BODY_Y0 ? y : Math.min(y, BODY_Y0 - 1)
    );
    const edge =
      y >= BODY_Y0
        ? get(base, SPINE_R, y)
        : get(d, SPINE_R, y);

    for (let dist = 1; dist <= 5; dist++) {
      const x = SPINE_R + dist;
      // Ideal: almost no bright side — quick pull to cavity
      const t = smoothstep(dist / 4.2);
      // Start slightly darker than front edge
      const startR = lerp(edge[0], cr, 0.35);
      const startG = lerp(edge[1], cg, 0.35);
      const startB = lerp(edge[2], cb, 0.35);
      const r = lerp(startR, cr, t);
      const g = lerp(startG, cg, t);
      const b = lerp(startB, cb, t);
      set(d, x, y, r, g, b);
    }
    // Ensure beyond is cavity
    for (let x = SPINE_R + 6; x <= SPINE_R + 16; x++) {
      set(d, x, y, cr, cg, cb);
    }
  }

  // Soften book5 top-right corner slightly (no sharp step)
  for (let y = BODY_Y0 - TOP_VISIBLE - 1; y <= BODY_Y0 + 2; y++) {
    for (let x = SPINE_R - 1; x <= SPINE_R + 3; x++) {
      if (y >= BODY_Y0 && x <= SPINE_R) continue; // protect front
      const samples = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (yy >= BODY_Y0 && xx <= SPINE_R) {
            samples.push(get(base, xx, yy));
          } else {
            samples.push(get(d, xx, yy));
          }
        }
      }
      const n = samples.length;
      const r = samples.reduce((s, p) => s + p[0], 0) / n;
      const g = samples.reduce((s, p) => s + p[1], 0) / n;
      const b = samples.reduce((s, p) => s + p[2], 0) / n;
      if (!(y >= BODY_Y0 && x <= SPINE_R)) set(d, x, y, r, g, b);
    }
  }

  // Verify front body unchanged
  let bodyCh = 0;
  for (let y = BODY_Y0; y <= BODY_Y1; y++) {
    for (let x = SPINE_L; x <= SPINE_R; x++) {
      const i = idx(x, y);
      if (d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2])
        bodyCh++;
    }
  }

  // Outside edit region unchanged
  const inEdit = (x, y) => {
    if (x >= SPINE_L && x <= SPINE_R && y >= 450 && y < BODY_Y0) return true;
    if (x >= SPINE_R + 1 && x <= SPINE_R + 16 && y >= 450 && y <= BODY_Y1)
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
  console.log({ bodyCh, outCh });

  const tmp = "public/images/shelf-background.tmp.png";
  await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
  fs.renameSync(tmp, "public/images/shelf-background.png");

  // Compares
  const afterTops = await sharp("public/images/shelf-background.png")
    .extract({ left: 60, top: 460, width: 180, height: 50 })
    .resize(540, 150, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const idealTops = await sharp("public/images/ref/ideal-normalized-918.png")
    .extract({ left: 60, top: 460, width: 180, height: 50 })
    .resize(540, 150, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const afterB5 = await sharp("public/images/shelf-background.png")
    .extract({ left: 175, top: 455, width: 70, height: 60 })
    .resize(280, 240, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const idealB5 = await sharp("public/images/ref/ideal-normalized-918.png")
    .extract({ left: 175, top: 455, width: 70, height: 60 })
    .resize(280, 240, { kernel: "lanczos3" })
    .png()
    .toBuffer();

  const label = (t, w) =>
    Buffer.from(
      `<svg width="${w}" height="24"><text x="6" y="17" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
    );

  await sharp({
    create: {
      width: 1120,
      height: 190,
      channels: 3,
      background: { r: 18, g: 18, b: 18 },
    },
  })
    .composite([
      { input: label("AFTER tops", 540), top: 4, left: 10 },
      { input: label("IDEAL tops", 540), top: 4, left: 570 },
      { input: afterTops, top: 30, left: 10 },
      { input: idealTops, top: 30, left: 570 },
    ])
    .png()
    .toFile("public/images/ref/final-after-vs-ideal-tops.png");

  await sharp({
    create: {
      width: 580,
      height: 270,
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

  await sharp(afterTops).toFile("public/images/ref/cmp-tone-after-tops.png");
  await sharp(idealTops).toFile("public/images/ref/cmp-tone-ideal-tops.png");
  await sharp(afterB5).toFile("public/images/ref/cmp-tone-after-book5.png");
  await sharp(idealB5).toFile("public/images/ref/cmp-tone-ideal-book5.png");

  // Also wider shelf crop for overall check
  await sharp("public/images/shelf-background.png")
    .extract({ left: 50, top: 440, width: 220, height: 160 })
    .resize(440, 320, { kernel: "lanczos3" })
    .png()
    .toFile("public/images/ref/cmp-after-spine-block.png");
  await sharp("public/images/ref/ideal-normalized-918.png")
    .extract({ left: 50, top: 440, width: 220, height: 160 })
    .resize(440, 320, { kernel: "lanczos3" })
    .png()
    .toFile("public/images/ref/cmp-ideal-spine-block.png");

  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
