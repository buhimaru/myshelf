import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = context.pages()[0] || (await context.newPage());
await page.goto("chrome://version/");
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  const t = document.body.innerText;
  const grab = (label) => {
    const re = new RegExp(label + "\\s+([^\\n]+)");
    const m = t.match(re);
    return m ? m[1].trim() : null;
  };
  return {
    profile: grab("プロフィール パス") || grab("Profile Path"),
    command: grab("コマンドライン") || grab("Command Line"),
  };
});
const cookies = await context.cookies();
const authNames = cookies
  .filter((c) => c.name.includes("auth") || c.name.startsWith("sb-"))
  .map((c) => c.name);
console.log(
  JSON.stringify({
    profile: info.profile,
    cookieCount: cookies.length,
    authCookieNameCount: authNames.length,
    commandHasUserData: (info.command || "").includes("User Data"),
  })
);

await page.goto("http://localhost:3000/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1500);
const ui = await page.evaluate(() => ({
  landing: Boolean(document.querySelector(".lp-hero")),
  toolbar: Boolean(document.querySelector(".my-shelf-toolbar")),
  count: document.querySelector(".my-shelf-count")?.textContent || null,
  guestCta: [...document.querySelectorAll("button")].some((b) =>
    (b.textContent || "").includes("正式アカウントに登録")
  ),
}));
console.log(JSON.stringify({ ui }));
