/**
 * ランディング用「全ジャンル61件」棚サンプルを高解像度撮影する。
 *
 * 安全方針:
 * - 普段使いの Chrome / Edge には一切接続しない（CDP禁止）
 * - Playwright 同梱 Chromium を独立プロファイルで起動する
 * - 既存ブラウザの強制終了・再起動はしない
 * - パスワード・認証トークン・user id を取得・記録しない
 * - Supabase データは変更しない（UI閲覧とスクショのみ）
 * - ログインが必要なら表示ブラウザで手動ログインを待つ
 *
 *   node scripts/capture-landing-sample-all.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const BASE = process.env.MYSHELF_BASE_URL || "http://localhost:3000";
const OUT = path.resolve("public/images/landing-sample-all.png");
const SCALE = Number(process.env.MYSHELF_CAPTURE_SCALE || 3);
const VIEW_W = Number(process.env.MYSHELF_CAPTURE_WIDTH || 1280);
// ログインモーダルが画面下部にはみ出さないよう、十分な高さを確保する。
// 以前は --window-size を 1100px に上限して viewport と乖離し、flex-end の
// モーダル下端（入力欄・ログインボタン）がウィンドウ外になっていた。
const VIEW_H = Number(process.env.MYSHELF_CAPTURE_HEIGHT || 1600);
const WAIT_MS = Number(process.env.MYSHELF_CAPTURE_WAIT_MS || 600000);
const EXPECT_COUNT = process.env.MYSHELF_EXPECT_ALL_COUNT || "61";
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
    const pager = Boolean(
      document.querySelector('[aria-label="棚のページ"]')
    );
    return {
      landing: Boolean(document.querySelector(".lp-hero")),
      hasToolbar: Boolean(document.querySelector(".my-shelf-toolbar")),
      hasCollection: Boolean(document.querySelector(".my-shelf-collection")),
      countText,
      filter,
      pager,
    };
  });
}

/**
 * ログイン待機。
 * - 開始時に一度だけ page.goto する
 * - 以降は goto / reload / ブラウザ再起動を一切しない
 * - 完了判定は waitForFunction（ページ内DOMのパッシブ監視）のみ
 */
async function waitForLoggedInShelf(page) {
  console.log(
    JSON.stringify({
      waitingForManualLogin: true,
      message:
        "撮影用ブラウザを開きました。画面は固定したままです。正式アカウントで手動ログインし、61件の棚が出るまで操作してください。待機中に再読み込み・再遷移は行いません。",
      url: BASE + "/",
      waitMs: WAIT_MS,
    })
  );

  // 唯一の自動遷移。これ以降の待機中はナビゲーション禁止。
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
      EXPECT_COUNT,
      {
        // ページ遷移を起こさず、DOM をポーリングするだけ
        timeout: WAIT_MS,
        polling: 1000,
      }
    );
  } catch (err) {
    throw new Error(
      `タイムアウト: ${EXPECT_COUNT}件の棚UIが検出できませんでした。手動ログイン後に再実行してください。 (${String(
        err && err.message ? err.message : err
      )})`
    );
  }

  const state = await readShelfUiState(page);
  console.log(
    JSON.stringify({
      loginDetected: true,
      countText: state.countText,
      filter: state.filter,
      pager: state.pager,
    })
  );
  return state;
}

async function prepareAllFilter(page) {
  const search = page.locator(".my-shelf-control--search");
  if ((await search.count()) > 0) {
    await search.fill("");
  }
  await page.locator(".my-shelf-control--filter").selectOption("all");
  await page.waitForTimeout(900);
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
  return readShelfUiState(page);
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
    throw new Error("ページ送りUIが見つかりません。構図が不完全です。");
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
  const width = Math.min(
    Math.round(box.width * scaleX),
    (meta.width ?? 0) - left
  );
  const height = Math.min(
    Math.round(box.height * scaleY),
    (meta.height ?? 0) - top
  );

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(full)
    .extract({ left, top, width, height })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return {
    box,
    crop: { left, top, width, height },
    fullPage: { width: meta.width, height: meta.height },
    scale: { scaleX, scaleY },
  };
}

/**
 * 完成判定。
 * この構図は意図的に白余白があるため、「端が白い＝切れ」とはみなさない。
 * 代わりに最小解像度と、内部に棚（木目）・下端付近のUI（ページ送り）があることを確認する。
 */
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

  // 木製棚: 暖色の茶系
  function isWoodish(r, g, b) {
    return r > 90 && r < 210 && g > 40 && g < 150 && b < 110 && r > g + 15 && g > b;
  }

  let woodHits = 0;
  const yMid0 = Math.floor(h * 0.25);
  const yMid1 = Math.floor(h * 0.75);
  for (let y = yMid0; y < yMid1; y += Math.max(1, Math.floor(h / 60))) {
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x += Math.max(1, Math.floor(w / 60))) {
      const [r, g, b] = at(x, y);
      if (isWoodish(r, g, b)) woodHits++;
    }
  }

  // 下端付近（ページ送り帯）に非白ピクセルがあるか
  let bottomUiHits = 0;
  const yBottom0 = Math.floor(h * 0.9);
  for (let y = yBottom0; y < h; y += Math.max(1, Math.floor(h / 80))) {
    for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x += Math.max(1, Math.floor(w / 80))) {
      const [r, g, b] = at(x, y);
      if (!isNearWhite(r, g, b)) bottomUiHits++;
    }
  }

  // 上端付近（検索欄帯）に非白ピクセルがあるか
  let topUiHits = 0;
  const yTop1 = Math.floor(h * 0.12);
  for (let y = 0; y < yTop1; y += Math.max(1, Math.floor(h / 80))) {
    for (let x = Math.floor(w * 0.05); x < Math.floor(w * 0.95); x += Math.max(1, Math.floor(w / 80))) {
      const [r, g, b] = at(x, y);
      if (!isNearWhite(r, g, b)) topUiHits++;
    }
  }

  const st = await fs.stat(outPath);
  const sizeOk = (meta.width ?? 0) >= 2000 && (meta.height ?? 0) >= 2000;
  const hasShelf = woodHits >= 20;
  const hasTopUi = topUiHits >= 5;
  const hasBottomUi = bottomUiHits >= 5;

  return {
    path: outPath,
    bytes: st.size,
    width: meta.width,
    height: meta.height,
    deviceScaleFactor: SCALE,
    woodHits,
    topUiHits,
    bottomUiHits,
    // 互換フィールド: 白余白は欠落ではない
    rightLooksClipped: false,
    bottomLooksClipped: false,
    ok: sizeOk && hasShelf && hasTopUi && hasBottomUi,
  };
}

async function main() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: SCALE,
    args: [
      "--disable-blink-features=AutomationControlled",
      // viewport と同じ高さにする（上限で切り詰めない）
      `--window-size=${VIEW_W},${VIEW_H}`,
      "--window-position=0,0",
    ],
  });

  const page = browser.pages()[0] || (await browser.newPage());

  try {
    await waitForLoggedInShelf(page);
    const prepared = await prepareAllFilter(page);
    if (!prepared.countText?.includes(EXPECT_COUNT)) {
      throw new Error(
        `件数が想定と異なります: ${prepared.countText} (expect ${EXPECT_COUNT})`
      );
    }
    if (prepared.filter !== "all") {
      throw new Error(`フィルタが all ではありません: ${prepared.filter}`);
    }

    console.log(
      JSON.stringify({
        readyToCapture: true,
        countText: prepared.countText,
        filter: prepared.filter,
        pager: prepared.pager,
      })
    );

    const capture = await captureRegion(page, OUT);
    const verify = await verifyEdges(OUT);
    console.log(JSON.stringify({ capture, verify }, null, 2));

    if (!verify.ok) {
      throw new Error(
        "四辺・解像度の検証に失敗しました。右端/下端の切れや解像度不足を確認してください。"
      );
    }

    console.log(
      JSON.stringify({
        ok: true,
        out: OUT,
        width: verify.width,
        height: verify.height,
        deviceScaleFactor: SCALE,
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
