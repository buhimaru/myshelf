/**
 * ランディング用「ドラマ33件」棚サンプルを高解像度撮影する。
 *
 * 安全方針:
 * - 普段使いの Chrome / Edge には一切接続しない（CDP禁止）
 * - Playwright 同梱 Chromium を独立プロファイルで起動する
 * - 既存ブラウザの強制終了はしない
 * - パスワード・認証トークン・user id を取得・記録しない
 * - Supabase データは変更しない
 * - ログイン待機中は goto/reload しない
 * - landing-sample-all.png は触らない
 *
 *   node scripts/capture-landing-sample-drama.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const BASE = process.env.MYSHELF_BASE_URL || "http://localhost:3000";
const OUT = path.resolve("public/images/landing-sample-drama.png");
const ALL_REF = path.resolve("public/images/landing-sample-all.png");
const SCALE = Number(process.env.MYSHELF_CAPTURE_SCALE || 3);
const VIEW_W = Number(process.env.MYSHELF_CAPTURE_WIDTH || 1280);
const VIEW_H = Number(process.env.MYSHELF_CAPTURE_HEIGHT || 1600);
const WAIT_MS = Number(process.env.MYSHELF_CAPTURE_WAIT_MS || 900000);
const EXPECT_LOGIN_COUNT = process.env.MYSHELF_EXPECT_ALL_COUNT || "61";
const EXPECT_DRAMA_COUNT = process.env.MYSHELF_EXPECT_DRAMA_COUNT || "33";
const TARGET_W = 3012;
const TARGET_H = 2385;
const PROFILE_DIR = path.join(
  os.tmpdir(),
  "myshelf-capture-profile-landing-all"
);

async function readShelfUiState(page) {
  return page.evaluate(() => {
    const countText =
      document.querySelector(".my-shelf-count")?.textContent?.trim() || null;
    const filter =
      document.querySelector(".my-shelf-control--filter")?.value || null;
    const pager = document.querySelector('[aria-label="棚のページ"]');
    const pageSelect = document.querySelector(".pagerSelect, [aria-label^='ページ']");
    // ImageShelf CSS module class may be hashed; prefer aria-label on select
    const select =
      document.querySelector('select[aria-label^="ページ"]') ||
      document.querySelector('[aria-label="棚のページ"] select');
    return {
      landing: Boolean(document.querySelector(".lp-hero")),
      hasToolbar: Boolean(document.querySelector(".my-shelf-toolbar")),
      hasCollection: Boolean(document.querySelector(".my-shelf-collection")),
      countText,
      filter,
      pager: Boolean(pager),
      pageLabel: select?.getAttribute("aria-label") || null,
      pageValue: select ? String(select.value) : null,
      unused: Boolean(pageSelect),
    };
  });
}

async function waitForLoggedInShelf(page) {
  console.log(
    JSON.stringify({
      waitingForManualLogin: true,
      message:
        "撮影用ブラウザを開きました。正式アカウントでログインし、61件の棚が出るまで操作してください。待機中に再読み込みはしません。",
      url: BASE + "/",
      waitMs: WAIT_MS,
      out: OUT,
    })
  );

  await page.goto(BASE + "/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  console.log(
    JSON.stringify({
      loginWaitIdle: true,
      mode: "dom-waitForFunction-only",
      noReload: true,
      noGoto: true,
    })
  );

  try {
    await page.waitForFunction(
      (expectCount) => {
        const landing = Boolean(document.querySelector(".lp-hero"));
        const toolbar = document.querySelector(".my-shelf-toolbar");
        const collection = document.querySelector(".my-shelf-collection");
        const countText =
          document.querySelector(".my-shelf-count")?.textContent?.trim() || "";
        return (
          !landing &&
          Boolean(toolbar) &&
          Boolean(collection) &&
          countText.includes(expectCount)
        );
      },
      EXPECT_LOGIN_COUNT,
      { timeout: WAIT_MS, polling: 1000 }
    );
  } catch (err) {
    throw new Error(
      `タイムアウト: ${EXPECT_LOGIN_COUNT}件の棚UIが検出できませんでした。 (${String(
        err && err.message ? err.message : err
      )})`
    );
  }

  return readShelfUiState(page);
}

async function waitImagesLoaded(page) {
  await page
    .waitForFunction(() => {
      const root = document.querySelector(".my-shelf-collection");
      if (!root) return false;
      const imgs = [...root.querySelectorAll("img")];
      if (imgs.length === 0) return false;
      return imgs.every((img) => img.complete && img.naturalWidth > 0);
    }, null, { timeout: 90000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}

async function prepareDramaPage1(page) {
  const search = page.locator(".my-shelf-control--search");
  if ((await search.count()) > 0) {
    await search.fill("");
  }

  await page.locator(".my-shelf-control--filter").selectOption("drama");
  await page.waitForTimeout(900);

  await page.waitForFunction(
    (expectCount) => {
      const filter = document.querySelector(".my-shelf-control--filter")?.value;
      const countText =
        document.querySelector(".my-shelf-count")?.textContent?.trim() || "";
      return filter === "drama" && countText.includes(expectCount);
    },
    EXPECT_DRAMA_COUNT,
    { timeout: 60000, polling: 500 }
  );

  const pageSelect = page.locator('select[aria-label^="ページ"]');
  await pageSelect.waitFor({ state: "visible", timeout: 30000 });
  await pageSelect.selectOption("0"); // 1 / 2
  await page.waitForTimeout(700);
  await waitImagesLoaded(page);

  const state = await readShelfUiState(page);
  if (!state.countText?.includes(EXPECT_DRAMA_COUNT)) {
    throw new Error(`ドラマ件数が想定外: ${state.countText}`);
  }
  if (state.filter !== "drama") {
    throw new Error(`フィルタが drama ではありません: ${state.filter}`);
  }
  if (state.pageValue !== "0") {
    throw new Error(`ページが 1/2 ではありません: ${state.pageLabel} value=${state.pageValue}`);
  }
  return state;
}

async function measureCaptureBox(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector(".my-shelf-toolbar");
    const collection = document.querySelector(".my-shelf-collection");
    const pager = document.querySelector('[aria-label="棚のページ"]');
    if (!toolbar || !collection) {
      throw new Error("撮影対象が見つかりません");
    }
    const a = toolbar.getBoundingClientRect();
    const b = collection.getBoundingClientRect();
    const p = pager ? pager.getBoundingClientRect() : null;
    const left = Math.min(a.left, b.left, p ? p.left : b.left) + window.scrollX;
    const right =
      Math.max(a.right, b.right, p ? p.right : b.right) + window.scrollX;
    const top = a.top + window.scrollY;
    const bottom =
      Math.max(b.bottom, p ? p.bottom : b.bottom) + window.scrollY;
    const padX = 14;
    const padYTop = 8;
    const padYBottom = 14;
    return {
      x: Math.max(0, Math.floor(left - padX)),
      y: Math.max(0, Math.floor(top - padYTop)),
      width: Math.ceil(right - left + padX * 2),
      height: Math.ceil(bottom - top + padYTop + padYBottom),
      hasPager: Boolean(pager),
    };
  });
}

async function captureRegion(page, outPath) {
  const box = await measureCaptureBox(page);
  if (!box.hasPager) {
    throw new Error("ページ送りUIが見つかりません。");
  }

  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 8)), box.y);
  await page.waitForTimeout(300);

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
  let width = Math.min(
    Math.round(box.width * scaleX),
    (meta.width ?? 0) - left
  );
  let height = Math.min(
    Math.round(box.height * scaleY),
    (meta.height ?? 0) - top
  );

  let pipeline = sharp(full).extract({ left, top, width, height });

  // 全ジャンル版と同じ寸法を目標。アスペクトがほぼ同じときだけリサイズ（歪ませない）
  const aspect = width / Math.max(1, height);
  const targetAspect = TARGET_W / TARGET_H;
  if (
    (width !== TARGET_W || height !== TARGET_H) &&
    Math.abs(aspect - targetAspect) / targetAspect < 0.02
  ) {
    pipeline = pipeline.resize({
      width: TARGET_W,
      height: TARGET_H,
      fit: "fill",
    });
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  if (path.resolve(outPath) === path.resolve(ALL_REF)) {
    throw new Error("安全停止: 全ジャンル版PNGへの書き込みは禁止です");
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);

  return {
    box,
    crop: { left, top, width, height },
    fullPage: { width: meta.width, height: meta.height },
    scale: { scaleX, scaleY },
  };
}

async function verifyEdges(outPath) {
  const img = sharp(outPath);
  const meta = await img.metadata();
  const { data, info } = await img
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  function at(x, y) {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  }
  function isNearWhite(r, g, b) {
    return r > 245 && g > 245 && b > 245;
  }
  function isWoodish(r, g, b) {
    return r > 90 && r < 210 && g > 40 && g < 150 && b < 110 && r > g + 15 && g > b;
  }

  let woodHits = 0;
  for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.75); y += Math.max(1, Math.floor(h / 60))) {
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x += Math.max(1, Math.floor(w / 60))) {
      if (isWoodish(...at(x, y))) woodHits++;
    }
  }
  let bottomUiHits = 0;
  for (let y = Math.floor(h * 0.9); y < h; y += Math.max(1, Math.floor(h / 80))) {
    for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x += Math.max(1, Math.floor(w / 80))) {
      if (!isNearWhite(...at(x, y))) bottomUiHits++;
    }
  }
  let topUiHits = 0;
  for (let y = 0; y < Math.floor(h * 0.12); y += Math.max(1, Math.floor(h / 80))) {
    for (let x = Math.floor(w * 0.05); x < Math.floor(w * 0.95); x += Math.max(1, Math.floor(w / 80))) {
      if (!isNearWhite(...at(x, y))) topUiHits++;
    }
  }

  const st = await fs.stat(outPath);
  const sizeOk = (meta.width ?? 0) >= 2000 && (meta.height ?? 0) >= 2000;
  return {
    path: outPath,
    bytes: st.size,
    width: meta.width,
    height: meta.height,
    deviceScaleFactor: SCALE,
    woodHits,
    topUiHits,
    bottomUiHits,
    ok: sizeOk && woodHits >= 20 && topUiHits >= 5 && bottomUiHits >= 5,
  };
}

async function assertAllPngUntouched(beforeStat) {
  const after = await fs.stat(ALL_REF);
  if (after.size !== beforeStat.size || after.mtimeMs !== beforeStat.mtimeMs) {
    throw new Error("全ジャンル版PNGが変更されています。中断します。");
  }
}

async function main() {
  const allBefore = await fs.stat(ALL_REF);
  await fs.mkdir(PROFILE_DIR, { recursive: true });

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: SCALE,
    args: [
      "--disable-blink-features=AutomationControlled",
      `--window-size=${VIEW_W},${VIEW_H}`,
      "--window-position=0,0",
    ],
  });

  const page = browser.pages()[0] || (await browser.newPage());

  try {
    const loggedIn = await waitForLoggedInShelf(page);
    console.log(JSON.stringify({ loginDetected: true, ...loggedIn }));

    const prepared = await prepareDramaPage1(page);
    console.log(
      JSON.stringify({
        readyToCapture: true,
        countText: prepared.countText,
        filter: prepared.filter,
        pageLabel: prepared.pageLabel,
        pageValue: prepared.pageValue,
      })
    );

    const capture = await captureRegion(page, OUT);
    await assertAllPngUntouched(allBefore);
    const verify = await verifyEdges(OUT);
    console.log(JSON.stringify({ capture, verify }, null, 2));

    if (!verify.ok) {
      throw new Error("検証に失敗しました。");
    }

    console.log(
      JSON.stringify({
        ok: true,
        out: OUT,
        width: verify.width,
        height: verify.height,
        deviceScaleFactor: SCALE,
        allPngUntouched: true,
      })
    );
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
