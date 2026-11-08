/**
 * READ-ONLY investigation for missing guest shelf.
 * - Does not sign in/out, clear storage, or mutate data
 * - Does not print auth tokens / passwords
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function decodeJwtPayload(token) {
  const part = String(token || "").split(".")[1];
  if (!part) return null;
  const json = Buffer.from(
    part.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
  return JSON.parse(json);
}

function summarizeUserFromAccessToken(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload !== "object") return null;
  return {
    subPrefix: String(payload.sub || "").slice(0, 8),
    subSuffix: String(payload.sub || "").slice(-4),
    subFull: payload.sub || null,
    isAnonymous: payload.is_anonymous === true,
    role: payload.role || null,
    exp: payload.exp || null,
    sessionIdPrefix: payload.session_id
      ? String(payload.session_id).slice(0, 8)
      : null,
  };
}

async function inspectViaCdp() {
  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  } catch {
    return { cdp: false };
  }
  const context = browser.contexts()[0];
  if (!context) return { cdp: true, context: false };

  const cookies = await context.cookies("http://localhost:3000/");
  const authCookie = cookies.find((c) => c.name.includes("auth-token"));
  let sessionSummary = null;
  let parseNote = null;
  if (authCookie?.value) {
    try {
      // Cookie value may be base64- encoded JSON session
      let raw = authCookie.value;
      if (raw.startsWith("base64-")) {
        raw = Buffer.from(raw.slice("base64-".length), "base64").toString(
          "utf8"
        );
      }
      const parsed = JSON.parse(raw);
      sessionSummary = summarizeUserFromAccessToken(parsed.access_token);
      parseNote = "cookie-session-json";
    } catch {
      parseNote = "cookie-parse-failed";
    }
  }

  const page =
    context.pages().find((p) => (p.url() || "").includes("localhost:3000")) ||
    context.pages()[0] ||
    (await context.newPage());

  // Navigate only if needed; do not clear storage
  if (!(page.url() || "").includes("localhost:3000")) {
    await page.goto("http://localhost:3000/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  } else {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  }
  await page.waitForTimeout(2500);

  const ui = await page.evaluate(() => {
    let itemCacheCount = null;
    let ownKey = null;
    try {
      const raw = localStorage.getItem("myshelf-items");
      const arr = raw ? JSON.parse(raw) : null;
      itemCacheCount = Array.isArray(arr) ? arr.length : null;
    } catch {
      itemCacheCount = -1;
    }
    ownKey =
      Object.keys(localStorage).find((k) =>
        k.startsWith("myshelf-view-mode:own:")
      ) || null;
    return {
      url: location.href,
      landing: Boolean(document.querySelector(".lp-hero")),
      heading: document.querySelector(".my-shelf-heading")?.textContent || null,
      countText: document.querySelector(".my-shelf-count")?.textContent || null,
      empty: Boolean(document.querySelector(".my-shelf-empty-state")),
      guestCta: [...document.querySelectorAll("button")].some((b) =>
        (b.textContent || "").includes("正式アカウントに登録")
      ),
      itemCacheCount,
      ownKeySuffix: ownKey ? ownKey.slice(-12) : null,
      ownKeyFull: ownKey
        ? ownKey.replace("myshelf-view-mode:own:", "")
        : null,
    };
  });

  // Read-only fetch of current user's items count via in-page supabase if available
  const live = await page.evaluate(async () => {
    try {
      // Reuse app's public env by calling same-origin; avoid printing tokens
      const mod = await import("/utils/supabase/client.ts").catch(() => null);
      return { viaModule: Boolean(mod) };
    } catch {
      return { viaModule: false };
    }
  });

  return {
    cdp: true,
    authCookiePresent: Boolean(authCookie),
    authCookieName: authCookie?.name || null,
    parseNote,
    sessionSummary,
    ui,
    live,
    localhostCookieNames: cookies.map((c) => c.name),
  };
}

function inspectCookieDbReadonly() {
  const src = path.join(
    process.env.LOCALAPPDATA,
    "Google",
    "Chrome",
    "User Data",
    "Default",
    "Network",
    "Cookies"
  );
  if (!fs.existsSync(src)) {
    return { cookieDb: false };
  }
  const tmp = path.join(os.tmpdir(), "myshelf-invest-cookies.db");
  try {
    fs.copyFileSync(src, tmp);
  } catch (e) {
    return {
      cookieDb: true,
      copyFailed: true,
      reason: "locked-or-unreadable",
    };
  }
  const py = `
import sqlite3
c=sqlite3.connect(r"${tmp.replace(/\\/g, "\\\\")}")
rows=c.execute("select host_key, name, length(encrypted_value), expires_utc from cookies").fetchall()
local=[r for r in rows if 'localhost' in r[0] or '127.0.0.1' in r[0]]
sb=[r for r in rows if r[1].startswith('sb-')]
print('total', len(rows))
print('localhost', len(local))
print('sb', len(sb))
for r in local:
    print('LOCAL', r[0], r[1], 'encLen', r[2], 'exp', r[3])
for r in sb:
    if r not in local:
        print('SB', r[0], r[1], 'encLen', r[2])
`;
  const pyFile = path.join(os.tmpdir(), "myshelf-invest-cookies.py");
  fs.writeFileSync(pyFile, py, "utf8");
  const out = execFileSync("python", [pyFile], { encoding: "utf8" });
  return { cookieDb: true, copyFailed: false, out: out.trim() };
}

const cdpInfo = await inspectViaCdp();
const dbInfo = inspectCookieDbReadonly();
console.log(JSON.stringify({ cdpInfo, dbInfo }, null, 2));
