import sharp from "sharp";

const BG = "public/images/prototypes/shelf-empty-candidate-1024x664.png";
const OV = "public/images/prototypes/navy-leather-spines-overlay.png";
const ADOPTED = "public/images/shelf-background-navy-leather-complete.png";
const OUT = "public/images/prototypes/layered-newempty-composite.png";

const layered = await sharp(BG)
  .composite([{ input: OV, top: 0, left: 0 }])
  .png()
  .toBuffer();
await sharp(layered).toFile(OUT);

function label(t, w) {
  return Buffer.from(
    `<svg width="${w}" height="24"><text x="6" y="17" fill="#eee" font-size="13" font-family="Segoe UI,sans-serif">${t}</text></svg>`
  );
}

async function pair(name, box, scale) {
  const pw = box.width * scale;
  const ph = box.height * scale;
  const a = await sharp(ADOPTED)
    .extract(box)
    .resize(pw, ph, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const b = await sharp(layered)
    .extract(box)
    .resize(pw, ph, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: pw * 2 + 28,
      height: ph + 40,
      channels: 3,
      background: { r: 16, g: 16, b: 16 },
    },
  })
    .composite([
      { input: label(`採用版 ${name}`, pw), top: 4, left: 8 },
      { input: label(`新空棚+透明5冊 ${name}`, pw), top: 4, left: pw + 20 },
      { input: a, top: 30, left: 8 },
      { input: b, top: 30, left: pw + 20 },
    ])
    .png()
    .toFile(`public/images/ref/newempty-layered-compare-${name}.png`);
}

await pair("shelf", { left: 55, top: 455, width: 220, height: 160 }, 3);
await pair("edge", { left: 195, top: 475, width: 70, height: 130 }, 7);
await pair("foot", { left: 195, top: 575, width: 70, height: 35 }, 8);
console.log("wrote", OUT);
