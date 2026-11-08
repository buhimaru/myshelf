/**
 * READ-ONLY: compare backup JSON with live DB rows for source guest UID.
 * Does not mutate data. Does not print secrets.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SOURCE_UID = "59eae996-ab86-4dfe-b49d-ac7ea9819867";
const backupPath =
  process.argv[2] ||
  path.join(
    os.homedir(),
    "Desktop",
    "myshelf-backups",
    "items-59eae996-readonly-2026-11-07-02-10-25.json"
  );

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

function normalize(v) {
  if (v === undefined) return null;
  return v;
}

function rowKey(row) {
  return String(row.id);
}

function fingerprint(row) {
  return COLUMNS.map((c) => JSON.stringify(normalize(row[c]))).join("|");
}

const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
if (backup.count !== 61 || backup.items?.length !== 61) {
  throw new Error(`backup count invalid: ${backup.count}/${backup.items?.length}`);
}
if (backup.user_id !== SOURCE_UID) {
  throw new Error("backup user_id mismatch");
}

const stamp = Date.now();
const sqlPath = path.join(os.tmpdir(), `myshelf-cmp-${stamp}.sql`);
const sql = `select ${COLUMNS.join(", ")}
from public.items
where user_id = '${SOURCE_UID}'
order by created_at asc, id asc;
`;
fs.writeFileSync(sqlPath, sql, "utf8");

const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const combined = execFileSync(
  npxCmd,
  ["supabase", "db", "query", "--linked", "-f", sqlPath],
  {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_YES: "1" },
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === "win32",
  }
);
const start = combined.indexOf("{");
const parsed = JSON.parse(combined.slice(start));
const dbRows = parsed.rows;
if (!Array.isArray(dbRows) || dbRows.length !== 61) {
  throw new Error(`db count invalid: ${dbRows?.length}`);
}

const backupById = new Map(backup.items.map((r) => [rowKey(r), r]));
const dbById = new Map(dbRows.map((r) => [rowKey(r), r]));

const onlyInBackup = [...backupById.keys()].filter((id) => !dbById.has(id));
const onlyInDb = [...dbById.keys()].filter((id) => !backupById.has(id));
const mismatched = [];
for (const [id, b] of backupById) {
  const d = dbById.get(id);
  if (!d) continue;
  if (fingerprint(b) !== fingerprint(d)) mismatched.push(id);
}

const categoryBackup = {};
const categoryDb = {};
for (const r of backup.items) {
  categoryBackup[r.category] = (categoryBackup[r.category] || 0) + 1;
}
for (const r of dbRows) {
  categoryDb[r.category] = (categoryDb[r.category] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      ok:
        onlyInBackup.length === 0 &&
        onlyInDb.length === 0 &&
        mismatched.length === 0,
      backupPath,
      backupCount: backup.items.length,
      dbCount: dbRows.length,
      onlyInBackupCount: onlyInBackup.length,
      onlyInDbCount: onlyInDb.length,
      mismatchedCount: mismatched.length,
      categoryBackup,
      categoryDb,
      sourceUid: SOURCE_UID,
    },
    null,
    2
  )
);
