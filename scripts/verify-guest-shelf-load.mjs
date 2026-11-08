import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => (p.url() || "").includes("localhost:3000")) ||
  context.pages()[0];

const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("response", async (res) => {
  const url = res.url();
  if (!/supabase|rest\/v1\/items|auth/i.test(url)) return;
  // Do not log bodies or tokens — status + path only
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {}
  errors.push(`resp ${res.status()} ${path}`);
});

await page.goto("http://localhost:3000/", {
  waitUntil: "networkidle",
  timeout: 90000,
});
await page.waitForTimeout(4000);

const ui = await page.evaluate(() => {
  let itemCacheCount = null;
  try {
    const raw = localStorage.getItem("myshelf-items");
    const arr = raw ? JSON.parse(raw) : null;
    itemCacheCount = Array.isArray(arr) ? arr.length : null;
  } catch {
    itemCacheCount = -1;
  }
  return {
    heading: document.querySelector(".my-shelf-heading")?.textContent || null,
    count: document.querySelector(".my-shelf-count")?.textContent || null,
    empty: Boolean(document.querySelector(".my-shelf-empty-state")),
    toolbar: Boolean(document.querySelector(".my-shelf-toolbar")),
    guestCta: [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").includes("正式アカウントに登録")
    ),
    bodySnippet: (document.querySelector(".my-shelf-main")?.innerText || "")
      .slice(0, 400),
    itemCacheCount,
    isAnonymousHint: Boolean(
      document.querySelector(".my-shelf-account")?.innerText?.includes("正式")
    ),
  };
});

console.log(JSON.stringify({ ui, net: errors.slice(0, 30) }, null, 2));
