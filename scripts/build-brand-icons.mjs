/**
 * Build myshelf brand icons from the official shelf line-art source.
 * Preserves stroke weight/shape; only crops padding and makes white transparent.
 */
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SOURCE = join(
  process.env.USERPROFILE || "",
  ".cursor/projects/c-Users-user-Desktop-myshelf/assets/c__Users_user_AppData_Roaming_Cursor_User_workspaceStorage_51f75e25082b29e8ee12fbb4300782fc_images_dadd1a90-db4c-47bd-ae8c-e7c12b7174d1-d97f1a23-5004-4ccb-b584-bb47f63333ab.png"
);

const OUT_BRAND = join(root, "public", "brand");
const OUT_ICONS = join(root, "public", "icons");
const OUT_APP = join(root, "app");

const WHITE_THRESHOLD = 245; // near-white → transparent
const CONTENT_PADDING_RATIO = 0.12; // padding around detected content in final square

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function findContentBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 8) continue;
      if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) {
    throw new Error("No non-white content found in source image");
  }

  return { minX, minY, maxX, maxY };
}

function makeTransparent(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
}

/** Minimal ICO writer embedding PNG payloads (modern browsers). */
function pngsToIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = [];

  for (const png of pngBuffers) {
    // Read IHDR width/height
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    entries.push({
      width: w >= 256 ? 0 : w,
      height: h >= 256 ? 0 : h,
      size: png.length,
      offset,
      png,
    });
    offset += png.length;
  }

  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type icon
  buf.writeUInt16LE(count, 4);

  let entryAt = 6;
  for (const e of entries) {
    buf.writeUInt8(e.width, entryAt);
    buf.writeUInt8(e.height, entryAt + 1);
    buf.writeUInt8(0, entryAt + 2); // color palette
    buf.writeUInt8(0, entryAt + 3); // reserved
    buf.writeUInt16LE(1, entryAt + 4); // planes
    buf.writeUInt16LE(32, entryAt + 6); // bit count
    buf.writeUInt32LE(e.size, entryAt + 8);
    buf.writeUInt32LE(e.offset, entryAt + 12);
    e.png.copy(buf, e.offset);
    entryAt += 16;
  }
  return buf;
}

async function main() {
  ensureDir(OUT_BRAND);
  ensureDir(OUT_ICONS);

  // Keep a pristine copy of the approved artwork in-repo
  const sourceDest = join(OUT_BRAND, "myshelf-shelf-lineart-source.png");
  copyFileSync(SOURCE, sourceDest);

  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  const bounds = findContentBounds(pixels, info.width, info.height);
  makeTransparent(pixels);

  const contentW = bounds.maxX - bounds.minX + 1;
  const contentH = bounds.maxY - bounds.minY + 1;
  const side = Math.ceil(
    Math.max(contentW, contentH) * (1 + CONTENT_PADDING_RATIO * 2)
  );
  const padX = Math.floor((side - contentW) / 2);
  const padY = Math.floor((side - contentH) / 2);

  // Extract content region with alpha already applied
  const cropped = Buffer.alloc(contentW * contentH * 4);
  for (let y = 0; y < contentH; y++) {
    for (let x = 0; x < contentW; x++) {
      const sx = bounds.minX + x;
      const sy = bounds.minY + y;
      const si = (sy * info.width + sx) * 4;
      const di = (y * contentW + x) * 4;
      cropped[di] = pixels[si];
      cropped[di + 1] = pixels[si + 1];
      cropped[di + 2] = pixels[si + 2];
      cropped[di + 3] = pixels[si + 3];
    }
  }

  const masterTransparent = await sharp(cropped, {
    raw: { width: contentW, height: contentH, channels: 4 },
  })
    .extend({
      top: padY,
      bottom: side - contentH - padY,
      left: padX,
      right: side - contentW - padX,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // High-res transparent master (1024)
  const master1024 = await sharp(masterTransparent)
    .resize(1024, 1024, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
  writeFileSync(join(OUT_BRAND, "myshelf-icon-1024.png"), master1024);

  // White-background master (for apple-touch / cases that dislike transparency)
  const master1024White = await sharp(master1024)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
  writeFileSync(join(OUT_BRAND, "myshelf-icon-1024-white.png"), master1024White);

  async function resizePng(buf, size, { flattenWhite = false } = {}) {
    let pipeline = sharp(buf).resize(size, size, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });
    if (flattenWhite) {
      pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
    }
    return pipeline.png().toBuffer();
  }

  // App Router conventions
  const icon32 = await resizePng(master1024, 32);
  const icon192 = await resizePng(master1024, 192);
  const icon512 = await resizePng(master1024, 512);
  const apple180 = await resizePng(master1024, 180, { flattenWhite: true });
  const fav16 = await resizePng(master1024, 16);
  const fav32 = await resizePng(master1024, 32);
  const fav48 = await resizePng(master1024, 48);

  writeFileSync(join(OUT_APP, "icon.png"), icon32);
  writeFileSync(join(OUT_APP, "apple-icon.png"), apple180);
  writeFileSync(join(OUT_ICONS, "icon-192.png"), icon192);
  writeFileSync(join(OUT_ICONS, "icon-512.png"), icon512);
  // Also keep larger transparent app icon for modern browsers via public
  writeFileSync(join(OUT_ICONS, "icon-32.png"), icon32);

  // Maskable: same artwork on white (Android adaptive icons dislike pure transparency)
  const maskable512 = await resizePng(master1024, 512, { flattenWhite: true });
  writeFileSync(join(OUT_ICONS, "icon-512-maskable.png"), maskable512);

  const ico = pngsToIco([fav16, fav32, fav48]);
  writeFileSync(join(OUT_APP, "favicon.ico"), ico);

  // Preview strip for local visual QA (16/32/48/64/128/180 on checker-ish white)
  const previewSizes = [16, 32, 48, 64, 128, 180, 192];
  const gap = 16;
  const cell = 200;
  const previewW = previewSizes.length * cell;
  const composites = [];
  for (let i = 0; i < previewSizes.length; i++) {
    const size = previewSizes[i];
    const png = await resizePng(master1024, size);
    composites.push({
      input: png,
      left: i * cell + Math.floor((cell - size) / 2),
      top: Math.floor((cell - size) / 2),
    });
  }
  const preview = await sharp({
    create: {
      width: previewW,
      height: cell,
      channels: 4,
      background: { r: 245, g: 245, b: 245, alpha: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
  writeFileSync(join(OUT_BRAND, "myshelf-icon-size-preview.png"), preview);

  console.log(
    JSON.stringify(
      {
        source: { width: info.width, height: info.height },
        bounds,
        content: { width: contentW, height: contentH },
        squareSideBeforeUpscale: side,
        outputs: [
          "public/brand/myshelf-shelf-lineart-source.png",
          "public/brand/myshelf-icon-1024.png",
          "public/brand/myshelf-icon-1024-white.png",
          "public/brand/myshelf-icon-size-preview.png",
          "app/favicon.ico",
          "app/icon.png",
          "app/apple-icon.png",
          "public/icons/icon-32.png",
          "public/icons/icon-192.png",
          "public/icons/icon-512.png",
          "public/icons/icon-512-maskable.png",
        ],
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
