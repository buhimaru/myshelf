/**
 * READ-ONLY export of items for a fixed guest user_id.
 * - SELECT only via `supabase db query --linked`
 * - Writes outside public/, never overwrites
 * - Does not print secrets
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const USER_ID = "59eae996-ab86-4dfe-b49d-ac7ea9819867";
const COLUMNS = [
  "id",
  "created_at",
  "title",
  "category",
  "image_url",
  "description",
  "user_id",
  "is_public",
  "creator",
];

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "-")
  .slice(0, 19);
const outDir = path.join(os.homedir(), "Desktop", "myshelf-backups");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(
  outDir,
  `items-59eae996-readonly-${stamp}.json`
);
if (fs.existsSync(outFile)) {
  throw new Error(`refusing to overwrite: ${outFile}`);
}

const sqlPath = path.join(os.tmpdir(), `myshelf-export-items-${stamp}.sql`);
const rawPath = path.join(os.tmpdir(), `myshelf-export-raw-${stamp}.json`);
const errPath = path.join(os.tmpdir(), `myshelf-export-err-${stamp}.txt`);

const sql = `select ${COLUMNS.join(", ")}
from public.items
where user_id = '${USER_ID}'
order by created_at asc, id asc;
`;
fs.writeFileSync(sqlPath, sql, "utf8");

const env = { ...process.env, SUPABASE_YES: "1" };
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
let combined = "";
try {
  combined = execFileSync(
    npxCmd,
    ["supabase", "db", "query", "--linked", "-f", sqlPath],
    {
      encoding: "utf8",
      env,
      cwd: process.cwd(),
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === "win32",
    }
  );
} catch (e) {
  fs.writeFileSync(
    errPath,
    String(e?.stdout || "") + "\n" + String(e?.stderr || e),
    "utf8"
  );
  throw new Error(`query failed; see ${errPath}`);
}
fs.writeFileSync(rawPath, combined, "utf8");

const start = combined.indexOf("{");
if (start < 0) throw new Error("no JSON in query output");
const parsed = JSON.parse(combined.slice(start));
const rows = parsed.rows;
if (!Array.isArray(rows)) throw new Error("rows missing");

for (const row of rows) {
  for (const col of COLUMNS) {
    if (!(col in row)) throw new Error(`missing column: ${col}`);
  }
  if (String(row.user_id) !== USER_ID) {
    throw new Error("unexpected user_id in result");
  }
}

if (rows.length !== 61) {
  throw new Error(`expected 61 rows, got ${rows.length}`);
}

const payload = {
  exported_at: new Date().toISOString(),
  source: "public.items",
  mode: "select-only",
  user_id: USER_ID,
  column_order: COLUMNS,
  count: rows.length,
  items: rows,
};

fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
const st = fs.statSync(outFile);

// Minimal report only
console.log(
  JSON.stringify({
    ok: true,
    count: rows.length,
    bytes: st.size,
    path: outFile,
  })
);
