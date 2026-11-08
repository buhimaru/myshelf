import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const cookies = await context.cookies();
const slim = cookies.map((c) => ({
  domain: c.domain,
  name: c.name,
  httpOnly: c.httpOnly,
}));
console.log(JSON.stringify({ total: slim.length, cookies: slim }, null, 2));

const page = context.pages().find((p) => p.url().includes("localhost")) ||
  context.pages()[0] ||
  (await context.newPage());
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
const ui = await page.evaluate(() => ({
  landing: Boolean(document.querySelector(".lp-hero")),
  toolbar: Boolean(document.querySelector(".my-shelf-toolbar")),
  count: document.querySelector(".my-shelf-count")?.textContent || null,
  guestCta: [...document.querySelectorAll("button")].some((b) =>
    (b.textContent || "").includes("正式アカウントに登録")
  ),
  localStorageKeyCount: Object.keys(localStorage).length,
  localStorageInteresting: Object.keys(localStorage).filter((k) =>
    /supabase|sb-|auth|myshelf/i.test(k)
  ),
}));
console.log(JSON.stringify({ ui }));
