/**
 * Approved one-shot: duplicate 61 items to formal account in one transaction.
 * - Never UPDATE/DELETE source rows
 * - COMMIT only after in-tx verification
 * - Saves source_id -> new_id manifest
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const SOURCE_UID = "59eae996-ab86-4dfe-b49d-ac7ea9819867";
const TARGET_UID = "f3421d42-e029-45aa-813a-1a27a62c46e5";
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
const BACKUP = path.join(
  os.homedir(),
  "Desktop",
  "myshelf-backups",
  "items-59eae996-readonly-2026-11-07-02-10-25.json"
);
const OUT_DIR = path.join(os.homedir(), "Desktop", "myshelf-backups");

function runSql(sql, label) {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const sqlPath = path.join(os.tmpdir(), `myshelf-restore-${label}-${stamp}.sql`);
  fs.writeFileSync(sqlPath, sql, "utf8");
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const combined = execFileSync(
    npxCmd,
    ["supabase", "db", "query", "--linked", "-f", sqlPath],
    {
      encoding: "utf8",
      env: { ...process.env, SUPABASE_YES: "1" },
      cwd: process.cwd(),
      maxBuffer: 30 * 1024 * 1024,
      shell: process.platform === "win32",
    }
  );
  const start = combined.indexOf("{");
  if (start < 0) {
    throw new Error(`${label}: no JSON in output`);
  }
  return JSON.parse(combined.slice(start));
}

function normalize(v) {
  if (v === undefined) return null;
  return v;
}

function contentFingerprint(row) {
  // Compare display fields only (ignore id/user_id which intentionally differ on clone)
  return [
    "created_at",
    "title",
    "category",
    "image_url",
    "description",
    "is_public",
    "creator",
  ]
    .map((c) => JSON.stringify(normalize(row[c])))
    .join("|");
}

function fullFingerprint(row) {
  return COLUMNS.map((c) => JSON.stringify(normalize(row[c]))).join("|");
}

function fetchItems(userId) {
  const sql = `select ${COLUMNS.join(", ")}
from public.items
where user_id = '${userId}'
order by created_at asc, id asc;`;
  const parsed = runSql(sql, `fetch-${userId.slice(0, 8)}`);
  return parsed.rows || [];
}

// --- Step 1: preflight ---
const backup = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
if (backup.count !== 61 || backup.items?.length !== 61) {
  throw new Error("preflight: backup count != 61");
}
if (backup.user_id !== SOURCE_UID) {
  throw new Error("preflight: backup user_id mismatch");
}

const sourceBefore = fetchItems(SOURCE_UID);
const targetBefore = fetchItems(TARGET_UID);
if (sourceBefore.length !== 61) {
  throw new Error(`preflight: source count ${sourceBefore.length}`);
}
if (targetBefore.length !== 0) {
  throw new Error(`preflight: target count ${targetBefore.length}`);
}

const backupById = new Map(backup.items.map((r) => [String(r.id), r]));
for (const row of sourceBefore) {
  const b = backupById.get(String(row.id));
  if (!b) throw new Error("preflight: db id missing from backup");
  if (fullFingerprint(b) !== fullFingerprint(row)) {
    throw new Error(`preflight: mismatch for id ${row.id}`);
  }
}
if (backupById.size !== 61) throw new Error("preflight: backup map size");

const authCheck = runSql(
  `select
     (select is_anonymous from auth.users where id = '${TARGET_UID}') as target_is_anonymous,
     (select count(*)::int from public.profiles where id = '${TARGET_UID}') as target_profile_count;`,
  "auth-check"
);
const authRow = authCheck.rows?.[0];
if (!authRow || authRow.target_is_anonymous !== false) {
  throw new Error("preflight: target is not formal");
}
if (authRow.target_profile_count !== 1) {
  throw new Error("preflight: target profile missing");
}

console.log(
  JSON.stringify({
    phase: "preflight_ok",
    source: sourceBefore.length,
    target: targetBefore.length,
    backupMatch: true,
    targetUid: TARGET_UID,
  })
);

// Pre-generate mapping so we can verify and persist reliably
const mapping = sourceBefore.map((row) => ({
  source_id: String(row.id),
  new_id: randomUUID(),
  created_at: row.created_at,
  title: row.title,
  category: row.category,
  image_url: row.image_url,
  description: row.description,
  is_public: row.is_public,
  creator: row.creator,
}));

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  // timestamps / text
  return `'${String(value).replace(/'/g, "''")}'`;
}

const valuesSql = mapping
  .map(
    (m) =>
      `(${sqlLiteral(m.new_id)}::uuid, ${sqlLiteral(m.created_at)}::timestamptz, ${sqlLiteral(m.title)}, ${sqlLiteral(m.category)}, ${sqlLiteral(m.image_url)}, ${sqlLiteral(m.description)}, ${sqlLiteral(TARGET_UID)}::uuid, ${sqlLiteral(m.is_public)}, ${sqlLiteral(m.creator)}, ${sqlLiteral(m.source_id)}::uuid)`
  )
  .join(",\n");

// Single transaction: insert + verify + return status. Commit only if checks pass.
const txSql = `
BEGIN;

CREATE TEMP TABLE restore_staging (
  new_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  image_url text,
  description text,
  user_id uuid NOT NULL,
  is_public boolean,
  creator text,
  source_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO restore_staging (
  new_id, created_at, title, category, image_url, description, user_id, is_public, creator, source_id
) VALUES
${valuesSql};

DO $$
DECLARE
  src_count int;
  tgt_count int;
  stg_count int;
BEGIN
  SELECT count(*) INTO src_count FROM public.items WHERE user_id = '${SOURCE_UID}';
  SELECT count(*) INTO tgt_count FROM public.items WHERE user_id = '${TARGET_UID}';
  SELECT count(*) INTO stg_count FROM restore_staging;
  IF src_count <> 61 THEN RAISE EXCEPTION 'ABORT before insert: source=%', src_count; END IF;
  IF tgt_count <> 0 THEN RAISE EXCEPTION 'ABORT before insert: target=%', tgt_count; END IF;
  IF stg_count <> 61 THEN RAISE EXCEPTION 'ABORT before insert: staging=%', stg_count; END IF;
END $$;

INSERT INTO public.items (
  id, created_at, title, category, image_url, description, user_id, is_public, creator
)
SELECT
  new_id, created_at, title, category, image_url, description, user_id, is_public, creator
FROM restore_staging
ORDER BY created_at ASC, source_id ASC;

DO $$
DECLARE
  src_count int;
  tgt_count int;
  mismatch int;
BEGIN
  SELECT count(*) INTO src_count FROM public.items WHERE user_id = '${SOURCE_UID}';
  SELECT count(*) INTO tgt_count FROM public.items WHERE user_id = '${TARGET_UID}';
  IF src_count <> 61 THEN RAISE EXCEPTION 'ABORT after insert: source=%', src_count; END IF;
  IF tgt_count <> 61 THEN RAISE EXCEPTION 'ABORT after insert: target=%', tgt_count; END IF;

  SELECT count(*) INTO mismatch
  FROM restore_staging s
  JOIN public.items t ON t.id = s.new_id
  WHERE t.user_id <> '${TARGET_UID}'::uuid
     OR t.title IS DISTINCT FROM s.title
     OR t.category IS DISTINCT FROM s.category
     OR t.image_url IS DISTINCT FROM s.image_url
     OR t.description IS DISTINCT FROM s.description
     OR t.creator IS DISTINCT FROM s.creator
     OR t.is_public IS DISTINCT FROM s.is_public
     OR t.created_at IS DISTINCT FROM s.created_at;
  IF mismatch <> 0 THEN
    RAISE EXCEPTION 'ABORT after insert: field mismatch rows=%', mismatch;
  END IF;

  -- source untouched: every source_id still exists with same content owner
  SELECT count(*) INTO mismatch
  FROM restore_staging s
  LEFT JOIN public.items src ON src.id = s.source_id AND src.user_id = '${SOURCE_UID}'::uuid
  WHERE src.id IS NULL;
  IF mismatch <> 0 THEN
    RAISE EXCEPTION 'ABORT: source rows missing after insert=%', mismatch;
  END IF;
END $$;

COMMIT;

SELECT json_build_object(
  'committed', true,
  'source_count', (select count(*)::int from public.items where user_id = '${SOURCE_UID}'),
  'target_count', (select count(*)::int from public.items where user_id = '${TARGET_UID}')
) AS result;
`;

let txResult;
try {
  txResult = runSql(txSql, "tx-commit");
} catch (e) {
  console.error(
    JSON.stringify({
      phase: "transaction_failed_rolled_back_or_aborted",
      error: String(e.message || e),
    })
  );
  process.exit(1);
}

const resultRow = txResult.rows?.[0]?.result || txResult.rows?.[0];
const committedInfo =
  typeof resultRow === "string" ? JSON.parse(resultRow) : resultRow;

if (!committedInfo?.committed) {
  throw new Error("transaction did not report committed=true");
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "-")
  .slice(0, 19);
const manifestPath = path.join(
  OUT_DIR,
  `restore-id-map-${TARGET_UID.slice(0, 8)}-${stamp}.json`
);
const manifest = {
  committed_at: new Date().toISOString(),
  source_user_id: SOURCE_UID,
  target_user_id: TARGET_UID,
  count: mapping.length,
  pairs: mapping.map((m) => ({
    source_id: m.source_id,
    new_id: m.new_id,
    title: m.title,
    category: m.category,
    created_at: m.created_at,
  })),
};
if (fs.existsSync(manifestPath)) {
  throw new Error(`manifest exists: ${manifestPath}`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

// --- Step post-commit verification ---
const sourceAfter = fetchItems(SOURCE_UID);
const targetAfter = fetchItems(TARGET_UID);
if (sourceAfter.length !== 61) {
  throw new Error(`post: source count ${sourceAfter.length}`);
}
if (targetAfter.length !== 61) {
  throw new Error(`post: target count ${targetAfter.length}`);
}

// Source fully unchanged vs backup
for (const row of sourceAfter) {
  const b = backupById.get(String(row.id));
  if (!b || fullFingerprint(b) !== fullFingerprint(row)) {
    throw new Error("post: source diverged from backup");
  }
}

// Target content matches source content multiset (by fingerprint ignoring ids)
const sourceFp = sourceAfter.map(contentFingerprint).sort();
const targetFp = targetAfter.map(contentFingerprint).sort();
if (sourceFp.length !== 61 || targetFp.length !== 61) {
  throw new Error("post: fingerprint count");
}
for (let i = 0; i < 61; i++) {
  if (sourceFp[i] !== targetFp[i]) {
    throw new Error(`post: content mismatch at sorted index ${i}`);
  }
}

// All manifest new_ids exist on target
const targetIds = new Set(targetAfter.map((r) => String(r.id)));
for (const m of mapping) {
  if (!targetIds.has(m.new_id)) {
    throw new Error(`post: missing new_id ${m.new_id}`);
  }
}

const cat = {};
for (const r of targetAfter) {
  cat[r.category] = (cat[r.category] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      committed: true,
      sourceCount: sourceAfter.length,
      targetCount: targetAfter.length,
      sourceUnchanged: true,
      contentMatch: true,
      categoryTarget: cat,
      manifestPath,
      manifestPairs: mapping.length,
      targetUid: TARGET_UID,
      sourceUid: SOURCE_UID,
    },
    null,
    2
  )
);
