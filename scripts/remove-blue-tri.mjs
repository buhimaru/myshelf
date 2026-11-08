import sharp from "sharp";
import fs from "fs";

const W = 1024;
const H = 664;
const src = "public/images/shelf-background.png";

fs.copyFileSync(src, "public/images/ref/before-blue-tri-bg.png");
await sharp(src)
  .extract({ left: 200, top: 575, width: 45, height: 40 })
  .resize(360, 320, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/before-blue-tri-zoom.png");

const { data } = await sharp(src)
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

// Sample wood on shelf board near the foot gap
let wr = 0,
  wg = 0,
  wb = 0,
  wn = 0;
for (let y = 596; y <= 605; y++) {
  for (let x = 215; x <= 228; x++) {
    const [r, g, b] = get(d, x, y);
    const L = lum(r, g, b);
    if (L > 30 && L < 140 && r > g && r > b) {
      wr += r;
      wg += g;
      wb += b;
      wn++;
    }
  }
}
wr /= Math.max(1, wn);
wg /= Math.max(1, wn);
wb /= Math.max(1, wn);

let cr = 0,
  cg = 0,
  cb = 0,
  cn = 0;
for (let y = 585; y <= 593; y++) {
  for (let x = 220; x <= 228; x++) {
    const [r, g, b] = get(d, x, y);
    if (lum(r, g, b) < 50) {
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
console.log({ wood: [wr, wg, wb], wn, cavity: [cr, cg, cb], cn });

/**
 * Only the bright triangular foot remnant at book5 BR.
 * Do not touch spine front (x<=208), tops, or upper side profile.
 */
let changed = 0;
for (let y = 582; y <= 600; y++) {
  for (let x = 209; x <= 222; x++) {
    const [r, g, b] = get(d, x, y);
    const L = lum(r, g, b);
    const distX = x - 208;
    const onShelf = y >= 594;
    const isRemnant = onShelf
      ? L > 70
      : (distX >= 3 && L > 100) ||
        (distX >= 5 && L > 80) ||
        (y >= 588 && distX >= 2 && L > 120);
    if (!isRemnant) continue;

    let tr, tg, tb;
    if (onShelf) {
      let sr = 0,
        sg = 0,
        sb = 0,
        sn = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = 2; dx <= 6; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 215 && xx <= 235 && yy >= 594 && yy <= 610) {
            const p = get(d, xx, yy);
            if (lum(...p) < 150 && p[0] > p[2]) {
              sr += p[0];
              sg += p[1];
              sb += p[2];
              sn++;
            }
          }
        }
      }
      if (sn > 0) {
        tr = sr / sn;
        tg = sg / sn;
        tb = sb / sn;
      } else {
        tr = wr;
        tg = wg;
        tb = wb;
      }
    } else {
      const t = Math.min(1, (distX - 1) / 4);
      tr = r * (1 - t) + cr * t;
      tg = g * (1 - t) + cg * t;
      tb = b * (1 - t) + cb * t;
      if (lum(tr, tg, tb) > 90) {
        tr = cr;
        tg = cg;
        tb = cb;
      }
    }
    set(x, y, tr, tg, tb);
    changed++;
  }
}
console.log({ changed });

let bodyCh = 0,
  topsCh = 0,
  sideUpperCh = 0,
  outCh = 0,
  editCh = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const ch =
      d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2];
    if (!ch) continue;
    if (x >= 72 && x <= 208 && y >= 481 && y <= 595) bodyCh++;
    else if (x >= 72 && x <= 208 && y >= 450 && y < 481) topsCh++;
    else if (x >= 209 && x <= 222 && y >= 481 && y < 582) sideUpperCh++;
    else if (x >= 209 && x <= 222 && y >= 582 && y <= 600) editCh++;
    else outCh++;
  }
}
console.log({ bodyCh, topsCh, sideUpperCh, outCh, editCh });

const tmp = "public/images/shelf-background.tmp.png";
await sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
fs.renameSync(tmp, src);

await sharp(src)
  .extract({ left: 200, top: 575, width: 45, height: 40 })
  .resize(360, 320, { kernel: "nearest" })
  .png()
  .toFile("public/images/ref/after-blue-tri-zoom.png");

const before = await sharp("public/images/ref/before-blue-tri-zoom.png")
  .png()
  .toBuffer();
const after = await sharp("public/images/ref/after-blue-tri-zoom.png")
  .png()
  .toBuffer();
const label = (t) =>
  Buffer.from(
    `<svg width="360" height="24"><text x="8" y="17" fill="#eee" font-size="14" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );

await sharp({
  create: {
    width: 740,
    height: 360,
    channels: 3,
    background: { r: 20, g: 20, b: 20 },
  },
})
  .composite([
    { input: label("BEFORE"), top: 4, left: 10 },
    { input: label("AFTER"), top: 4, left: 380 },
    { input: before, top: 30, left: 10 },
    { input: after, top: 30, left: 380 },
  ])
  .png()
  .toFile("public/images/ref/compare-blue-tri.png");

console.log("done");
