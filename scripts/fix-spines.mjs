import sharp from "sharp";
import fs from "fs";

const beforePath = "public/images/ref/bg-before-spine-fix.png";
const bgPath = "public/images/shelf-background.png";

// Outer-frame-mapped goal: bottom anchored at 595, h≈120 → top 476
const target = { left: 72, top: 476, width: 137, height: 120, bottom: 595 };
const old = { left: 72, top: 457, width: 137, height: 139, bottom: 595 };

const { data, info } = await sharp(beforePath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const ch = 4;
const out = Buffer.from(data);
const idx = (x, y) => (y * w + x) * ch;

// Extract spines: skip the transitional top 2px of binder edge for cleaner goal-like top
const extractTop = old.top + 2;
const extractH = old.bottom - extractTop + 1;
const spineRaw = await sharp(Buffer.from(data), {
  raw: { width: w, height: h, channels: 4 },
})
  .extract({
    left: old.left,
    top: extractTop,
    width: old.width,
    height: extractH,
  })
  .resize(target.width, target.height, { fit: "fill", kernel: "lanczos3" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Fill vacated region (old.top .. target.top-1) with pure dark cavity (rows 447-451 only)
const cavityRows = [447, 448, 449, 450, 451];
for (let y = old.top; y < target.top; y++) {
  for (let x = old.left; x < old.left + old.width; x++) {
    const srcY = cavityRows[(y - old.top + x) % cavityRows.length];
    const ti = idx(x, y);
    const si = idx(x, srcY);
    // Slight horizontal jitter from neighbors for less tiling
    const jx = Math.max(
      old.left,
      Math.min(old.left + old.width - 1, x + ((y + x) % 3) - 1),
    );
    const sj = idx(jx, srcY);
    out[ti] = Math.round(data[si] * 0.7 + data[sj] * 0.3);
    out[ti + 1] = Math.round(data[si + 1] * 0.7 + data[sj + 1] * 0.3);
    out[ti + 2] = Math.round(data[si + 2] * 0.7 + data[sj + 2] * 0.3);
    out[ti + 3] = 255;
  }
}

// Paste resized spines
const sd = spineRaw.data;
const sw = spineRaw.info.width;
const sh = spineRaw.info.height;
for (let y = 0; y < sh; y++) {
  for (let x = 0; x < sw; x++) {
    const si = (y * sw + x) * 3;
    const ti = idx(target.left + x, target.top + y);
    out[ti] = sd[si];
    out[ti + 1] = sd[si + 1];
    out[ti + 2] = sd[si + 2];
    out[ti + 3] = 255;
  }
}

// Soft 1px top blend into cavity (very light)
for (let x = target.left; x < target.left + target.width; x++) {
  const ti = idx(x, target.top);
  const above = idx(x, target.top - 1);
  const a = 0.25;
  out[ti] = Math.round(out[ti] * (1 - a) + out[above] * a);
  out[ti + 1] = Math.round(out[ti + 1] * (1 - a) + out[above + 1] * a);
  out[ti + 2] = Math.round(out[ti + 2] * (1 - a) + out[above + 2] * a);
}

const patched = await sharp(out, {
  raw: { width: w, height: h, channels: 4 },
}).png().toBuffer();
fs.writeFileSync(bgPath, patched);

// Verify change region
let changed = 0;
let changedOutside = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    if (
      out[i] !== data[i] ||
      out[i + 1] !== data[i + 1] ||
      out[i + 2] !== data[i + 2]
    ) {
      changed++;
      const inRect =
        x >= old.left &&
        x < old.left + old.width &&
        y >= old.top &&
        y <= old.bottom;
      if (!inRect) changedOutside++;
    }
  }
}

const check = await sharp(patched)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const cd = check.data;
const lum = (x, y) => {
  const i = (y * w + x) * 4;
  return (cd[i] + cd[i + 1] + cd[i + 2]) / 3;
};
let t = null;
let b = null;
let L = 999;
let R = 0;
for (let y = 450; y < 620; y++) {
  for (let x = 60; x < 230; x++) {
    if (lum(x, y) > 200 && lum(x, y) < 247) {
      if (t == null) t = y;
      b = y;
      L = Math.min(L, x);
      R = Math.max(R, x);
    }
  }
}

// Fill band brightness check (should stay dark)
let fillMean = 0;
let fillN = 0;
for (let y = old.top; y < target.top; y++) {
  for (let x = old.left; x < old.left + old.width; x++) {
    fillMean += lum(x, y);
    fillN++;
  }
}

console.log(
  JSON.stringify(
    {
      changed,
      changedOutside,
      result: { t, b, h: b - t + 1, L, R, w: R - L + 1 },
      target,
      fillMean: fillMean / fillN,
    },
    null,
    2,
  ),
);
