import sharp from "sharp";
import fs from "fs";

/**
 * Find blue triangle by:
 * 1) Scanning bg for cool/blue outliers near book5 BR
 * 2) Mapping from user attachment relative to spine geometry
 * 3) Checking if cover overlay is the source
 */

const W = 1024;
const H = 664;
const SPINE_L = 72;
const SPINE_R = 208;

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isBlueish(r, g, b) {
  // Cover cyan/blue OR cool remnant
  if (b > 90 && r < 130 && b > r + 35) return true;
  if (b > 100 && g > 80 && r < 80 && b >= g - 10) return true; // cyan
  if (b > 70 && b > r + 20 && b > g + 10 && r < 100) return true;
  return false;
}

const bg = await sharp("public/images/shelf-background.png")
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const hits = [];
for (let y = 450; y < H; y++) {
  for (let x = 180; x < 280; x++) {
    const i = (y * W + x) * 4;
    const r = bg.data[i],
      g = bg.data[i + 1],
      b = bg.data[i + 2];
    if (isBlueish(r, g, b)) hits.push({ x, y, r, g, b });
  }
}
console.log("bg blueish in search box", hits.length);
if (hits.length) {
  console.log(
    "bbox",
    Math.min(...hits.map((p) => p.x)),
    Math.max(...hits.map((p) => p.x)),
    Math.min(...hits.map((p) => p.y)),
    Math.max(...hits.map((p) => p.y))
  );
  console.log(hits.slice(0, 20));
}

// Attachment analysis with better spine detection (exclude page white: require brown wood below)
const ap =
  "C:/Users/user/.cursor/projects/c-Users-user-Desktop-myshelf/assets/c__Users_user_AppData_Roaming_Cursor_User_workspaceStorage_51f75e25082b29e8ee12fbb4300782fc_images____________2301_-00302a8d-997e-42b4-8d5a-fd09f4ff11f4.png";
const att = await sharp(ap).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const aW = att.info.width;
const aH = att.info.height;

// Find spine: white columns that sit ABOVE wood (warm brown row beneath)
let best = null;
for (let yBot = 100; yBot < aH - 10; yBot++) {
  // check if row yBot+5 is wood-ish
  let wood = 0;
  for (let x = 40; x < aW - 40; x++) {
    const i = ((yBot + 5) * aW + x) * 4;
    const r = att.data[i],
      g = att.data[i + 1],
      b = att.data[i + 2];
    if (r > 70 && r > g && r > b && b < 80) wood++;
  }
  if (wood < 40) continue;

  // white run on yBot-20
  const y = yBot - 20;
  if (y < 10) continue;
  let runs = [];
  let start = -1;
  for (let x = 0; x < aW; x++) {
    const i = (y * aW + x) * 4;
    const white =
      att.data[i] > 210 && att.data[i + 1] > 205 && att.data[i + 2] > 200;
    if (white) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, aW - 1]);
  const spineRun = runs.filter((r) => r[1] - r[0] > 40).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  if (!spineRun) continue;
  const width = spineRun[1] - spineRun[0];
  if (width > 80 && width < 200) {
    best = { yBot, L: spineRun[0], R: spineRun[1], width, wood };
  }
}
console.log("attach spine detect", best);

if (best) {
  const { L, R, yBot } = best;
  // Find blue near R, yBot
  const blues = [];
  for (let y = yBot - 35; y <= yBot + 2; y++) {
    for (let x = R - 5; x <= R + 40; x++) {
      if (x < 0 || x >= aW || y < 0 || y >= aH) continue;
      const i = (y * aW + x) * 4;
      const r = att.data[i],
        g = att.data[i + 1],
        b = att.data[i + 2];
      if (isBlueish(r, g, b)) blues.push({ x, y, r, g, b });
    }
  }
  console.log("attach blues near foot", blues.length);
  if (blues.length) {
    const minX = Math.min(...blues.map((p) => p.x));
    const maxX = Math.max(...blues.map((p) => p.x));
    const minY = Math.min(...blues.map((p) => p.y));
    const maxY = Math.max(...blues.map((p) => p.y));
    console.log("attach blue bbox", minX, maxX, minY, maxY);
    console.log(blues.slice(0, 15));

    // Map to bg: attach L,R,yBot → bg 72,208,595
    const mapX = (ax) => SPINE_L + ((ax - L) / (R - L)) * (SPINE_R - SPINE_L);
    // estimate spine top in attach
    let aTop = yBot;
    for (let y = yBot; y > 10; y--) {
      let n = 0;
      for (let x = L; x <= R; x++) {
        const i = (y * aW + x) * 4;
        if (att.data[i] > 210) n++;
      }
      if (n > (R - L) * 0.35) aTop = y;
      else if (y < yBot - 50) break;
    }
    const mapY = (ay) => 481 + ((ay - aTop) / (yBot - aTop)) * (595 - 481);
    console.log("attach spine top", aTop);
    console.log(
      "mapped blue bbox bg",
      mapX(minX).toFixed(1),
      mapX(maxX).toFixed(1),
      mapY(minY).toFixed(1),
      mapY(maxY).toFixed(1)
    );

    // Save attach crop
    const sl = Math.max(0, minX - 10);
    const st = Math.max(0, minY - 10);
    const sw = Math.min(aW - sl, maxX - minX + 25);
    const sh = Math.min(aH - st, maxY - minY + 25);
    await sharp(ap)
      .extract({ left: sl, top: st, width: sw, height: sh })
      .resize(sw * 6, sh * 6, { kernel: "nearest" })
      .png()
      .toFile("public/images/ref/attach-blue-found.png");
  }
}

// Composite: bg + first bay3 cover at x=228,y=482,size=110 and scan for blue at junction
const coverUrlCandidates = [
  "public/images/ref/pokemon-cover.jpg",
  "public/images/ref/op-cover.jpg",
];

// List what cover is actually bay3 slot0 by simulating
// We'll just overlay a 110x110 from a downloaded cover at 228,482
async function fetchCover(url, out) {
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return out;
  try {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(out, buf);
    return out;
  } catch (e) {
    console.log("fetch fail", url, e.message);
    return null;
  }
}

// Kind of Blue / face covers used nearby - try pokemon and also check items
const pokemon = await fetchCover(
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co5pi6.jpg",
  "public/images/ref/pokemon-cover.jpg"
);

if (pokemon) {
  const cover = await sharp(pokemon).resize(110, 110).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  // Scan cover bottom-left 20x20 for blue
  const cW = 110;
  const cBlues = [];
  for (let y = 90; y < 110; y++) {
    for (let x = 0; x < 25; x++) {
      const i = (y * cW + x) * 4;
      const r = cover.data[i],
        g = cover.data[i + 1],
        b = cover.data[i + 2];
      if (isBlueish(r, g, b)) cBlues.push({ x, y, r, g, b });
    }
  }
  console.log("pokemon BL blues", cBlues.length, cBlues.slice(0, 5));

  // Composite onto bg at 228,482 and find blue near 208,590
  const canvas = Buffer.from(bg.data);
  for (let y = 0; y < 110; y++) {
    for (let x = 0; x < 110; x++) {
      const ci = (y * cW + x) * 4;
      const dx = 228 + x;
      const dy = 482 + y;
      if (dx >= W || dy >= H) continue;
      const di = (dy * W + dx) * 4;
      // simple overwrite
      canvas[di] = cover.data[ci];
      canvas[di + 1] = cover.data[ci + 1];
      canvas[di + 2] = cover.data[ci + 2];
    }
  }
  const compBlues = [];
  for (let y = 560; y < 610; y++) {
    for (let x = 200; x < 250; x++) {
      const i = (y * W + x) * 4;
      if (isBlueish(canvas[i], canvas[i + 1], canvas[i + 2]))
        compBlues.push({
          x,
          y,
          r: canvas[i],
          g: canvas[i + 1],
          b: canvas[i + 2],
        });
    }
  }
  console.log("composite with pokemon blues near junction", compBlues.length);
  if (compBlues.length) console.log(compBlues.slice(0, 10));
}

console.log("done");
