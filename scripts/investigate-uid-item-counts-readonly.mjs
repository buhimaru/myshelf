/**
 * READ-ONLY: use in-page session only to count current user's items.
 * Also opens known public shelves in the same browser and reads visible counts.
 * Does not mutate auth/storage/DB. Does not print tokens.
 */
import { chromium } from "playwright";

const KNOWN = [
  "f3421d42-e029-45aa-813a-1a27a62c46e5",
  "6c7a91a6-db52-4eb3-a414-6ac68666c273",
  "1c006d98-2733-446d-9ff0-a85a659e98b1",
  "db506907-522c-44ee-9c64-526afd99b6b4",
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = context.pages()[0] || (await context.newPage());

// Current session JWT claims (no token printed)
const claims = await page.evaluate(() => {
  const row = document.cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("sb-") && s.includes("auth-token="));
  if (!row) return { present: false };
  let raw = decodeURIComponent(row.slice(row.indexOf("=") + 1));
  try {
    if (raw.startsWith("base64-")) {
      const b64 = raw.slice("base64-".length);
      raw = atob(b64);
    }
    const parsed = JSON.parse(raw);
    const [, payload] = parsed.access_token.split(".");
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return {
      present: true,
      sub: json.sub,
      isAnonymous: json.is_anonymous === true,
      iat: json.iat,
      exp: json.exp,
      amr: json.amr || null,
    };
  } catch {
    return { present: true, parseFailed: true };
  }
});

await page.goto("http://localhost:3000/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2000);
const home = await page.evaluate(() => ({
  empty: Boolean(document.querySelector(".my-shelf-empty-state")),
  countText: document.querySelector(".my-shelf-count")?.textContent || null,
  guestCta: [...document.querySelectorAll("button")].some((b) =>
    (b.textContent || "").includes("正式アカウントに登録")
  ),
}));

const publicViews = [];
for (const id of KNOWN) {
  await page.goto(`http://localhost:3000/shelf/${id}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const view = await page.evaluate(() => {
    const heading =
      document.querySelector(".my-shelf-heading")?.textContent || null;
    const count =
      document.querySelector(".my-shelf-count")?.textContent ||
      [...document.querySelectorAll("p,span,div")]
        .map((el) => el.textContent || "")
        .find((t) => /\d+\s*件/.test(t)) ||
      null;
    const body = document.querySelector(".my-shelf-main")?.innerText || "";
    return {
      heading,
      countText: count,
      isPrivate: body.includes("非公開"),
      isMissing: body.includes("見つかりません") || body.includes("存在しません"),
      loading: body.includes("読み込み中"),
      snippet: body.slice(0, 180).replace(/\s+/g, " "),
    };
  });
  publicViews.push({ id, ...view });
}

console.log(JSON.stringify({ claims, home, publicViews }, null, 2));
