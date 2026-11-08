/**
 * ランディング用棚サンプル A/B を高解像度撮影する。
 *
 * 安全方針:
 * - 既存ブラウザのゲスト（匿名）セッションを CDP 接続で再利用する
 * - signInAnonymously / パスワードログインは行わない
 * - 認証トークン・user id をログ出力しない
 * - storageState を public/ 配下へ保存しない
 *
 *   MYSHELF_CDP_URL=http://127.0.0.1:9222 node scripts/capture-landing-shelf-samples.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BASE = process.env.MYSHELF_BASE_URL || "http://localhost:3000";
const OUT_ALL = path.resolve("public/images/landing-sample-all.png");
const OUT_DRAMA = path.resolve("public/images/landing-sample-drama.png");
const SCALE = Number(process.env.MYSHELF_CAPTURE_SCALE || 3);
const VIEW_W = Number(process.env.MYSHELF_CAPTURE_WIDTH || 1280);
const VIEW_H = Number(process.env.MYSHELF_CAPTURE_HEIGHT || 1900);
const WAIT_MS = Number(process.env.MYSHELF_CAPTURE_WAIT_MS || 90000);
const CDP_URL = process.env.MYSHELF_CDP_URL || "";
const EXPECT_ALL = process.env.MYSHELF_EXPECT_ALL_COUNT || "61";
const EXPECT_DRAMA = process.env.MYSHELF_EXPECT_DRAMA_COUNT || "33";

async function applyHiDpi(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: VIEW_W,
    height: VIEW_H,
    deviceScaleFactor: SCALE,
    mobile: false,
  });
  return session;
}

/** トークンや user id を出さず、棚UIの状態だけ確認する */
async function readShelfUiState(page) {
  return page.evaluate(() => {
    const countText =
      document.querySelector(".my-shelf-count")?.textContent?.trim() || null;
    const formalCta = [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").includes("正式アカウントに登録")
    );
    return {
      landing: Boolean(document.querySelector(".lp-hero")),
      hasToolbar: Boolean(document.querySelector(".my-shelf-toolbar")),
      countText,
      looksLikeGuestShelf: formalCta,
      filterValue:
        document.querySelector(".my-shelf-control--filter")?.value || null,
    };
  });
}

async function waitForGuestShelf(page) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await page.goto(BASE + "/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1000);
    const state = await readShelfUiState(page);
    if (!state.landing && state.hasToolbar && state.countText) {
      console.log(
        JSON.stringify({
          ready: true,
          countText: state.countText,
          looksLikeGuestShelf: state.looksLikeGuestShelf,
        })
      );
      return state;
    }
    console.log(
      JSON.stringify({
        waiting: true,
        landing: state.landing,
        hasToolbar: state.hasToolbar,
      })
    );
    await page.waitForTimeout(2000);
  }
  throw new Error(
    "ゲスト棚UIを検出できませんでした。普段のChromeプロファイルで localhost:3000 が棚表示か確認してください。"
  );
}

async function prepareFilter(page, category) {
  const search = page.locator(".my-shelf-control--search");
  if ((await search.count()) > 0) {
    await search.fill("");
  }
  await page.locator(".my-shelf-control--filter").selectOption(category);
  await page.waitForTimeout(800);
  await page
    .waitForFunction(() => {
      const root = document.querySelector(".my-shelf-collection");
      if (!root) return false;
      const imgs = [...root.querySelectorAll("img")];
      if (imgs.length === 0) return false;
      return imgs.every((img) => img.complete && img.naturalWidth > 0);
    }, null, { timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  const state = await readShelfUiState(page);
  return state.countText;
}

async function measureCaptureBox(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector(".my-shelf-toolbar");
    const collection = document.querySelector(".my-shelf-collection");
    if (!toolbar || !collection) {
      throw new Error("撮影対象が見つかりません");
    }
    const a = toolbar.getBoundingClientRect();
    const b = collection.getBoundingClientRect();
    const left = Math.min(a.left, b.left) + window.scrollX;
    const right = Math.max(a.right, b.right) + window.scrollX;
    const top = a.top + window.scrollY;
    const bottom = b.bottom + window.scrollY;
    const padX = 12;
    const padY = 10;
    return {
      x: Math.max(0, Math.floor(left - padX)),
      y: Math.max(0, Math.floor(top - padY)),
      width: Math.ceil(right - left + padX * 2),
      height: Math.ceil(bottom - top + padY * 2),
    };
  });
}

async function captureRegion(page, outPath) {
  const box = await measureCaptureBox(page);
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 8)), box.y);
  await page.waitForTimeout(250);

  const full = await page.screenshot({
    type: "png",
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });

  const meta = await sharp(full).metadata();
  const scroll = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }));
  const scaleX = (meta.width ?? 0) / scroll.w;
  const scaleY = (meta.height ?? 0) / scroll.h;
  const left = Math.max(0, Math.round(box.x * scaleX));
  const top = Math.max(0, Math.round(box.y * scaleY));
  const width = Math.min(
    Math.round(box.width * scaleX),
    (meta.width ?? 0) - left
  );
  const height = Math.min(
    Math.round(box.height * scaleY),
    (meta.height ?? 0) - top
  );

  await sharp(full)
    .extract({ left, top, width, height })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const outMeta = await sharp(outPath).metadata();
  const st = await fs.stat(outPath);
  console.log(
    JSON.stringify({
      outPath,
      bytes: st.size,
      width: outMeta.width,
      height: outMeta.height,
      deviceScaleFactor: SCALE,
    })
  );
}

async function main() {
  if (!CDP_URL) {
    throw new Error(
      "MYSHELF_CDP_URL が必要です。普段のChromeへCDP接続し、新規セッションは作りません。"
    );
  }

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) throw new Error("CDP context がありません");
  const page = context.pages()[0] || (await context.newPage());
  const session = await applyHiDpi(page);

  try {
    const ready = await waitForGuestShelf(page);
    if (EXPECT_ALL && ready.countText && !ready.countText.includes(EXPECT_ALL)) {
      console.warn(
        `警告: 全ジャンル件数が想定(${EXPECT_ALL})と異なります: ${ready.countText}`
      );
    }

    const countAll = await prepareFilter(page, "all");
    console.log(JSON.stringify({ filter: "all", countText: countAll }));
    await captureRegion(page, OUT_ALL);

    const countDrama = await prepareFilter(page, "drama");
    console.log(JSON.stringify({ filter: "drama", countText: countDrama }));
    if (
      EXPECT_DRAMA &&
      countDrama &&
      !countDrama.includes(EXPECT_DRAMA)
    ) {
      console.warn(
        `警告: ドラマ件数が想定(${EXPECT_DRAMA})と異なります: ${countDrama}`
      );
    }
    await captureRegion(page, OUT_DRAMA);

    // 幅を揃える（拡大はしない）
    const am = await sharp(OUT_ALL).metadata();
    const bm = await sharp(OUT_DRAMA).metadata();
    const targetW = Math.min(am.width ?? 0, bm.width ?? 0);
    if (targetW > 0 && am.width !== bm.width) {
      const allBuf = await sharp(OUT_ALL)
        .resize({ width: targetW, withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const dramaBuf = await sharp(OUT_DRAMA)
        .resize({ width: targetW, withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      await fs.writeFile(OUT_ALL, allBuf);
      await fs.writeFile(OUT_DRAMA, dramaBuf);
      console.log(JSON.stringify({ normalizedWidth: targetW }));
    }
  } finally {
    await session.detach().catch(() => {});
    // connectOverCDP では browser.close() しない（普段のChromeを閉じない）
  }
}

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
