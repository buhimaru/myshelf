import sharp from "sharp";
import fs from "fs";

const snap = "public/images/ref/bg-before-book5-tops.png";
const bgPath = "public/images/shelf-background.png";
const { data, info } = await sharp(snap)
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
const bookW = (SPINE_R - SPINE_L + 1) / 5;
const TOP_DEPTH = 4;
const TOP_Y0 = SPINE_TOP - TOP_DEPTH;
const TOP_Y1 = SPINE_TOP;

const set = (x, y, r, g, b) => {
  const i = idx(x, y);
  out[i] = r;
  out[i + 1] = g;
  out[i + 2] = b;
  out[i + 3] = 255;
};
const get = (buf, x, y) => {
  const i = idx(x, y);
  return [buf[i], buf[i + 1], buf[i + 2]];
};
const cav = (x, y) => {
  const sx = Math.min(w - 1, 234 + ((x * 5 + y) % 14));
  return get(data, sx, y);
};

// 1) Remnant wipe above tops + right of book5
for (let y = 448; y <= 475; y++) {
  for (let x = 209; x <= 232; x++) {
    const [r, g, b] = cav(x, y);
    set(x, y, r, g, b);
  }
}
for (let y = 450; y <= 475; y++) {
  for (let x = SPINE_L; x <= SPINE_R; x++) {
    const [r0, g0, b0] = get(out, x, y);
    if ((r0 + g0 + b0) / 3 > 32) {
      const [r, g, b] = cav(x, y);
      set(x, y, r, g, b);
    }
  }
}

// 2) Clean corner; side taper starts below top
const SIDE_START = SPINE_TOP + 3;
for (let y = SPINE_TOP; y < SIDE_START; y++) {
  for (let x = SPINE_R + 1; x <= 232; x++) {
    const [r, g, b] = cav(x, y);
    set(x, y, r, g, b);
  }
}
for (let y = SIDE_START; y <= SPINE_TOP + 20; y++) {
  const t = Math.min(1, (y - SIDE_START) / 17);
  const maxDepth = 1.5 + t * 8.0;
  for (let x = SPINE_R + 1; x <= 232; x++) {
    const depth = x - SPINE_R;
    const [cr, cg, cb] = cav(x, y);
    const [or, og, ob] = get(data, x, y);
    const oL = (or + og + ob) / 3;
    let sr;
    let sg;
    let sb;
    if (oL > 55 && y >= SIDE_START + 6) {
      const a = Math.min(1, (y - (SIDE_START + 6)) / 10);
      const base = 172 - depth * 5;
      sr = Math.round(base * (1 - a) + or * a);
      sg = Math.round((base - 2) * (1 - a) + og * a);
      sb = Math.round((base - 5) * (1 - a) + ob * a);
    } else {
      const base = 168 - depth * 7 + t * 14;
      sr = Math.round(base);
      sg = Math.round(base - 2);
      sb = Math.round(base - 5);
    }
    if (depth < maxDepth - 0.5) set(x, y, sr, sg, sb);
    else if (depth < maxDepth + 0.5) {
      const cover = Math.max(0, Math.min(1, (maxDepth + 0.5 - depth) / 1.0));
      set(
        x,
        y,
        Math.round(sr * cover + cr * (1 - cover)),
        Math.round(sg * cover + cg * (1 - cover)),
        Math.round(sb * cover + cb * (1 - cover)),
      );
    } else set(x, y, cr, cg, cb);
  }
}

// 3) Soft top faces (into cavity = 奥側), no overflow past SPINE_R
for (let bi = 0; bi < 5; bi++) {
  const x0 = Math.round(SPINE_L + bi * bookW);
  const x1 = Math.min(SPINE_R, Math.round(SPINE_L + (bi + 1) * bookW) - 1);
  const width = x1 - x0 + 1;
  for (let y = TOP_Y0; y <= TOP_Y1; y++) {
    const depthT = (y - TOP_Y0) / (TOP_Y1 - TOP_Y0);
    for (let x = x0; x <= x1; x++) {
      const localX = (x - x0) / Math.max(1, width - 1);
      let shade = 158 + depthT * 48 + localX * 4;
      if (depthT > 0.55) shade += (depthT - 0.55) * 18;
      const edge = Math.min(x - x0, x1 - x);
      if (edge === 0) shade *= 0.62;
      else if (edge === 1) shade *= 0.82;
      if (depthT < 0.3) {
        const [cr, cg, cb] = cav(x, y);
        const a = depthT / 0.3;
        set(
          x,
          y,
          Math.round(cr * (1 - a) + shade * a),
          Math.round(cg * (1 - a) + (shade - 1) * a),
          Math.round(cb * (1 - a) + (shade - 4) * a),
        );
        continue;
      }
      if (y === SPINE_TOP) {
        const [br, bg, bb] = get(data, x, y);
        if ((br + bg + bb) / 3 > 180)
          shade = shade * 0.5 + ((br + bg + bb) / 3) * 0.5;
      }
      set(
        x,
        y,
        Math.min(255, Math.round(shade)),
        Math.min(255, Math.round(shade - 1)),
        Math.min(255, Math.round(shade - 3)),
      );
    }
  }
  if (bi < 4) {
    for (let y = TOP_Y0; y <= TOP_Y1; y++) {
      const i = idx(x1, y);
      out[i] = Math.round(out[i] * 0.52);
      out[i + 1] = Math.round(out[i + 1] * 0.52);
      out[i + 2] = Math.round(out[i + 2] * 0.52);
    }
  }
}

for (let x = SPINE_L; x <= SPINE_R; x++) {
  const [br, bg, bb] = get(data, x, SPINE_TOP + 1);
  if ((br + bg + bb) / 3 > 200)
    set(x, SPINE_TOP + 1, Math.round(br * 0.9), Math.round(bg * 0.9), Math.round(bb * 0.9));
}

fs.writeFileSync(
  bgPath,
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(),
);

let rem = 0;
for (let y = 448; y <= 475; y++) {
  for (let x = 209; x <= 232; x++) {
    const [r, g, b] = get(out, x, y);
    if ((r + g + b) / 3 > 40) rem++;
  }
}
let changedOutside = 0;
let changed = 0;
let bodyChanged = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = idx(x, y);
    if (
      out[i] !== data[i] ||
      out[i + 1] !== data[i + 1] ||
      out[i + 2] !== data[i + 2]
    ) {
      changed++;
      if (!(x >= 70 && x <= 232 && y >= 448 && y <= 496)) changedOutside++;
      if (y >= 497 && y <= SPINE_BOT && x >= SPINE_L && x <= SPINE_R)
        bodyChanged++;
    }
  }
}
console.log({ rem, changed, changedOutside, bodyChanged });

// Soft compares
const lab = (tw, t) =>
  Buffer.from(
    `<svg width="${tw}" height="20"><text x="${tw / 2}" y="14" text-anchor="middle" fill="#fff" font-size="11">${t}</text></svg>`,
  );

const b5b = await sharp(snap)
  .extract({ left: 175, top: 455, width: 70, height: 50 })
  .resize(280, 200, { kernel: "lanczos3" })
  .png()
  .toBuffer();
const b5a = await sharp(bgPath)
  .extract({ left: 175, top: 455, width: 70, height: 50 })
  .resize(280, 200, { kernel: "lanczos3" })
  .png()
  .toBuffer();
const tb = await sharp(snap)
  .extract({ left: 60, top: 465, width: 170, height: 40 })
  .resize(510, 120, { kernel: "lanczos3" })
  .png()
  .toBuffer();
const ta = await sharp(bgPath)
  .extract({ left: 60, top: 465, width: 170, height: 40 })
  .resize(510, 120, { kernel: "lanczos3" })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 580,
    height: 230,
    channels: 3,
    background: { r: 16, g: 16, b: 18 },
  },
})
  .composite([
    { input: lab(280, "BEFORE book5 TR"), left: 0, top: 2 },
    { input: lab(280, "AFTER book5 TR"), left: 290, top: 2 },
    { input: b5b, left: 0, top: 24 },
    { input: b5a, left: 290, top: 24 },
  ])
  .png()
  .toFile("public/images/ref/compare-1-book5-tr.png");

await sharp({
  create: {
    width: 1040,
    height: 150,
    channels: 3,
    background: { r: 16, g: 16, b: 18 },
  },
})
  .composite([
    { input: lab(510, "BEFORE tops"), left: 0, top: 2 },
    { input: lab(510, "AFTER tops"), left: 520, top: 2 },
    { input: tb, left: 0, top: 24 },
    { input: ta, left: 520, top: 24 },
  ])
  .png()
  .toFile("public/images/ref/compare-2-tops.png");

await sharp(bgPath).png().toFile("public/images/ref/compare-3-full-after.png");
console.log("compares written");
