import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => (p.url() || "").includes("localhost:3000")) ||
  context.pages()[0] ||
  (await context.newPage());

await page.goto("http://localhost:3000/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2000);

const info = await page.evaluate(async () => {
  const cookieNames = document.cookie
    .split(";")
    .map((s) => s.trim().split("=")[0])
    .filter(Boolean);

  let idbKeys = [];
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      idbKeys = dbs.map((d) => d.name).filter(Boolean);
    }
  } catch {
    idbKeys = ["<unavailable>"];
  }

  return {
    landing: Boolean(document.querySelector(".lp-hero")),
    toolbar: Boolean(document.querySelector(".my-shelf-toolbar")),
    count: document.querySelector(".my-shelf-count")?.textContent || null,
    guestCta: [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").includes("正式アカウントに登録")
    ),
    documentCookieNameCount: cookieNames.length,
    documentCookieHasSb: cookieNames.some((n) => n.startsWith("sb-")),
    indexedDbNames: idbKeys,
    localStorageInteresting: Object.keys(localStorage).filter((k) =>
      /supabase|sb-|auth|myshelf/i.test(k)
    ),
  };
});

const pwCookies = await context.cookies("http://localhost:3000/");
console.log(
  JSON.stringify(
    {
      ui: {
        landing: info.landing,
        toolbar: info.toolbar,
        count: info.count,
        guestCta: info.guestCta,
      },
      storage: {
        documentCookieNameCount: info.documentCookieNameCount,
        documentCookieHasSb: info.documentCookieHasSb,
        playwrightLocalhostCookieNames: pwCookies.map((c) => c.name),
        indexedDbNames: info.indexedDbNames,
        localStorageInteresting: info.localStorageInteresting,
      },
    },
    null,
    2
  )
);
