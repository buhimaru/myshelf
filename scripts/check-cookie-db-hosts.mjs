import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const src = path.join(
  process.env.LOCALAPPDATA,
  "Google",
  "Chrome",
  "User Data",
  "Default",
  "Network",
  "Cookies"
);
const tmp = path.join(os.tmpdir(), "myshelf-cookies-check.db");
fs.copyFileSync(src, tmp);

// Use python for sqlite if better-sqlite3 unavailable
const py = `
import sqlite3
c=sqlite3.connect(r"${tmp.replace(/\\/g, "\\\\")}")
rows=c.execute("select host_key, name from cookies").fetchall()
local=[r for r in rows if ("localhost" in r[0]) or ("127.0.0.1" in r[0])]
sb=[r for r in rows if r[1].startswith("sb-")]
print("total", len(rows))
print("localhost_hosts", len(local))
print("sb_names", len(sb))
for r in local[:50]:
    print("LOCAL", r[0], r[1])
for r in sb[:50]:
    print("SB", r[0], r[1])
`;
const pyFile = path.join(os.tmpdir(), "myshelf-cookies-check.py");
fs.writeFileSync(pyFile, py, "utf8");
execFileSync("python", [pyFile], { stdio: "inherit" });
