import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208; // inclusive front right of book 5
const SPINE_TOP = 482; // front body starts here (protect y>=482)
const FRONT_TOP = 482;

function idx(x, y) {
  return (y * W + x) * 4;
}

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function sample(data, x, y) {
  const i = idx(x, y);
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function setPx(data, x, y, r, g, b, a = 255) {
  const i = idx(x, y);
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

async function main() {
  // Restore clean ideal-mapped state (pre-blur)
  const basePath = "public/images/ref/bg-before-softblur.png";
  fs.copyFileSync(basePath, "public/images/shelf-background.png");
  console.log("restored from", basePath);

  const idealBuf = await sharp("public/images/ref/ideal-normalized-918.png")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const currBuf = await sharp("public/images/shelf-background.png")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ideal = idealBuf.data;
  const curr = Buffer.from(currBuf.data);

  // Snapshot before refine
  await sharp(curr, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile("public/images/ref/bg-before-refine-thin.png");

  // Analyze ideal top thickness: find where white front starts vs cavity
  console.log("--- ideal top edge scan at book centers ---");
  const centers = [85, 112, 140, 168, 196];
  for (const cx of centers) {
    const rows = [];
    for (let y = 465; y <= 490; y++) {
      const [r, g, b] = sample(ideal, cx, y);
      rows.push(`y${y}:${lum(r, g, b).toFixed(0)}`);
    }
    console.log("x" + cx, rows.join(" "));
  }

  // Sample cavity color from just above spines (dark shelf interior)
  let cr = 0,
    cg = 0,
    cb = 0,
    cn = 0;
  for (let y = 455; y <= 465; y++) {
    for (let x = SPINE_L; x <= SPINE_R + 12; x++) {
      const [r, g, b] = sample(ideal, x, y);
      if (lum(r, g, b) < 60) {
        cr += r;
        cg += g;
        cb += b;
        cn++;
      }
    }
  }
  cr = Math.round(cr / cn);
  cg = Math.round(cg / cn);
  cb = Math.round(cb / cn);
  console.log("cavity", cr, cg, cb, "n", cn);

  // Ideal: tops are thin ~y467-481 area. Curr already close from ideal map.
  // Refine strategy:
  // 1) For y < FRONT_TOP: replace tops zone with ideal pixels (same coords),
  //    but ONLY where we're in tops/cavity — never touch front body.
  // 2) Soften book5 right: for x > SPINE_R, blend ideal side into cavity faster
  //    (weaker protrusion).

  // Ideal-aligned spine left in normalized image may differ slightly.
  // Use direct pixel copy for tops strip y=460..481, x=72..208 from ideal,
  // then soft-blend book5 right from ideal with reduced width.

  for (let y = 460; y < FRONT_TOP; y++) {
    for (let x = SPINE_L; x <= SPINE_R; x++) {
      const [ir, ig, ib, ia] = sample(ideal, x, y);
      setPx(curr, x, y, ir, ig, ib, ia);
    }
  }

  // Book5 right side: ideal soft falloff, but clamp to thinner protrusion.
  // Ideal often falls off by ~x210-218. Copy ideal for x=209..220, y=460..581
  // but dampen mid-tones toward cavity to reduce visible thickness.
  for (let y = 460; y < FRONT_TOP; y++) {
    for (let x = SPINE_R + 1; x <= SPINE_R + 14; x++) {
      const [ir, ig, ib] = sample(ideal, x, y);
      const L = lum(ir, ig, ib);
      const dist = x - SPINE_R; // 1..14
      // Pull brighter side pixels toward cavity so side looks thinner
      const pull = Math.min(1, dist / 6) * 0.55;
      const r = Math.round(lerp(ir, cr, pull));
      const g = Math.round(lerp(ig, cg, pull));
      const b = Math.round(lerp(ib, cb, pull));
      // Beyond ~8px, force near cavity unless ideal is already dark
      if (dist > 8 && L > 40) {
        setPx(curr, x, y, cr, cg, cb);
      } else {
        setPx(curr, x, y, r, g, b);
      }
    }
  }

  // Also soften book5 right on body height (y>=FRONT_TOP) ONLY for x>SPINE_R
  // — do not change front face x<=SPINE_R
  for (let y = FRONT_TOP; y <= 581; y++) {
    for (let x = SPINE_R + 1; x <= SPINE_R + 14; x++) {
      const [ir, ig, ib] = sample(ideal, x, y);
      const L = lum(ir, ig, ib);
      const dist = x - SPINE_R;
      const pull = Math.min(1, dist / 5) * 0.65;
      const r = Math.round(lerp(ir, cr, pull));
      const g = Math.round(lerp(ig, cg, pull));
      const b = Math.round(lerp(ib, cb, pull));
      if (dist > 7 && L > 35) {
        setPx(curr, x, y, cr, cg, cb);
      } else {
        setPx(curr, x, y, r, g, b);
      }
    }
  }

  // Very light horizontal soften on tops only (1px neighbor mix) — no big blur
  const soft = Buffer.from(curr);
  for (let y = 468; y < FRONT_TOP; y++) {
    for (let x = SPINE_L + 1; x < SPINE_R; x++) {
      const a = sample(curr, x - 1, y);
      const b = sample(curr, x, y);
      const c = sample(curr, x + 1, y);
      setPx(
        soft,
        x,
        y,
        Math.round(a[0] * 0.2 + b[0] * 0.6 + c[0] * 0.2),
        Math.round(a[1] * 0.2 + b[1] * 0.6 + c[1] * 0.2),
        Math.round(a[2] * 0.2 + b[2] * 0.6 + c[2] * 0.2),
        b[3]
      );
    }
  }
  soft.copy(curr);

  // Verify front body unchanged vs restored base
  const baseRaw = await sharp(basePath).ensureAlpha().raw().toBuffer();
  let bodyCh = 0;
  for (let y = FRONT_TOP; y <= 581; y++) {
    for (let x = SPINE_L; x <= SPINE_R; x++) {
      const i = idx(x, y);
      if (
        curr[i] !== baseRaw[i] ||
        curr[i + 1] !== baseRaw[i + 1] ||
        curr[i + 2] !== baseRaw[i + 2]
      ) {
        bodyCh++;
      }
    }
  }

  // Outside edit region
  let outCh = 0;
  const edit = (x, y) =>
    x >= SPINE_L &&
    x <= SPINE_R + 14 &&
    y >= 460 &&
    y <= 581 &&
    !(y >= FRONT_TOP && x <= SPINE_R);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (edit(x, y)) continue;
      // tops zone x72-208 y460-481 is edited
      if (x >= SPINE_L && x <= SPINE_R && y >= 460 && y < FRONT_TOP) continue;
      const i = idx(x, y);
      if (
        curr[i] !== baseRaw[i] ||
        curr[i + 1] !== baseRaw[i + 1] ||
        curr[i + 2] !== baseRaw[i + 2]
      ) {
        outCh++;
      }
    }
  }

  console.log({ bodyCh, outCh });

  const tmp = "public/images/shelf-background.tmp.png";
  await sharp(curr, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(tmp);
  fs.renameSync(tmp, "public/images/shelf-background.png");
  console.log("wrote shelf-background.png");

  // Comparison images
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

  // Also save zoom crops alone
  await sharp(afterTops).toFile("public/images/ref/cmp-tone-after-tops.png");
  await sharp(idealTops).toFile("public/images/ref/cmp-tone-ideal-tops.png");
  await sharp(afterB5).toFile("public/images/ref/cmp-tone-after-book5.png");
  await sharp(idealB5).toFile("public/images/ref/cmp-tone-ideal-book5.png");

  console.log("compares ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
