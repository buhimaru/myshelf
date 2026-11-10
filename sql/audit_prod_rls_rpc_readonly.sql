-- myshelf 一般公開前監査 第2段階: 本番 RLS / RPC 適用状態の読み取り専用確認
-- ------------------------------------------------------------
-- 用途: Supabase Dashboard → SQL Editor で実行する。
-- 性質: SELECT のみ（カタログ／権限メタデータ）。行データの変更なし。
--
-- 禁止（このファイルには含めない）:
--   CREATE / ALTER / DROP / INSERT / UPDATE / DELETE / GRANT / REVOKE
--   本番データの参照（items / profiles / follows の行 SELECT もしない）
--   SERVICE_ROLE 等の秘密情報の出力
--
-- 照合元（リポジトリ）:
--   sql/stage2_mutual_follow_access.sql
--   sql/stage3_asymmetric_follow_access.sql
--   sql/stage4_cancel_outgoing_follow.sql
--   sql/stage5_search_public_shelves.sql
--
-- 結果の返し方:
--   各セクションの結果セットをそのままコピーして共有してください。
--   適用状態の判定は結果受領後に行います（推測判定はしません）。
-- ------------------------------------------------------------

-- ============================================================
-- 1) items / profiles / follows の RLS 有効状態
--    期待（stage2/3 前提）: いずれも relrowsecurity = true
-- ============================================================
SELECT
  '1_rls_enabled' AS audit_section,
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('items', 'profiles', 'follows')
ORDER BY c.relname;


-- ============================================================
-- 2) 各テーブルの RLS ポリシー一覧
--    名前・対象操作・roles・USING・WITH CHECK
--
--    items SELECT の期待（Stage2 適用後）:
--      policyname = items_select_mutual
--      cmd = SELECT
--      roles = {public}
--      qual に can_view_user_items(user_id) を含む
--    items の INSERT/UPDATE/DELETE ポリシーは Stage2/3 では置換しないが、
--      各 cmd が 1 件以上あることが前提検査の対象。
--    profiles / follows のポリシー名は Stage1 由来のため、本監査では実在内容を記録する。
-- ============================================================
SELECT
  '2_policies' AS audit_section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('items', 'profiles', 'follows')
ORDER BY tablename, cmd, policyname;


-- 2b) items の cmd 別ポリシー件数（CRUD 欠落の有無確認用）
SELECT
  '2b_items_policy_counts' AS audit_section,
  cmd,
  count(*) AS policy_count,
  array_agg(policyname ORDER BY policyname) AS policy_names
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'items'
GROUP BY cmd
ORDER BY cmd;


-- ============================================================
-- 3) can_view_user_items の存在・定義・属性
--    期待シグネチャ: public.can_view_user_items(owner_id uuid) → boolean
--    期待: SECURITY DEFINER / STABLE / search_path=public / owner=postgres
--    定義本文の期待（Stage3 最終形）:
--      - 所有者 / profiles.is_public / 向き付き accepted フォロー
--      - 閲覧者も非公開なら逆向き accepted も必要
--      - JWT is_anonymous = 'false' 制約
-- ============================================================
SELECT
  '3_can_view_user_items' AS audit_section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS is_security_definer,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
  END AS volatility,
  p.proconfig AS config_settings,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'can_view_user_items'
ORDER BY identity_args;


-- ============================================================
-- 4) follow 系 RPC の存在・定義・属性
--    対象:
--      follow_shelf(target_user_id uuid)
--      accept_follow_request(request_id uuid)
--      reject_follow_request(request_id uuid)
--      unfollow_shelf(target_user_id uuid)
--      remove_follower(follower_user_id uuid)
--      cancel_follow_request(target_user_id uuid)  -- Stage4
-- ============================================================
SELECT
  '4_follow_rpcs' AS audit_section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS is_security_definer,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
  END AS volatility,
  p.proconfig AS config_settings,
  obj_description(p.oid, 'pg_proc') AS comment_text,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'follow_shelf',
    'accept_follow_request',
    'reject_follow_request',
    'unfollow_shelf',
    'remove_follower',
    'cancel_follow_request'
  )
ORDER BY p.proname, identity_args;


-- 4b) 期待関数の欠落一覧（存在しないと行が出る）
SELECT
  '4b_follow_rpc_missing' AS audit_section,
  expected.function_name,
  expected.identity_args,
  'MISSING' AS status
FROM (
  VALUES
    ('follow_shelf', 'target_user_id uuid'),
    ('accept_follow_request', 'request_id uuid'),
    ('reject_follow_request', 'request_id uuid'),
    ('unfollow_shelf', 'target_user_id uuid'),
    ('remove_follower', 'follower_user_id uuid'),
    ('cancel_follow_request', 'target_user_id uuid')
) AS expected(function_name, identity_args)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = expected.function_name
    AND pg_get_function_identity_arguments(p.oid) = expected.identity_args
)
ORDER BY expected.function_name;


-- ============================================================
-- 5) 各 RPC の EXECUTE 権限（anon / authenticated / PUBLIC）
--
--    期待（stage3 + stage4 + stage5）:
--      can_view_user_items(uuid)
--        PUBLIC: あり（anon/authenticated は PUBLIC 経由で可）
--        anon 直接 ACL / authenticated 直接 ACL: 無くてよい（PUBLIC 付与）
--      follow_shelf / accept / reject / unfollow / remove_follower / cancel_follow_request
--        authenticated: あり
--        anon: なし
--        PUBLIC: なし
--      search_public_shelves_by_title(text, text, integer, integer)
--        anon: あり / authenticated: あり / PUBLIC: なし
-- ============================================================
WITH targets AS (
  SELECT *
  FROM (
    VALUES
      ('can_view_user_items', 'owner_id uuid'),
      ('follow_shelf', 'target_user_id uuid'),
      ('accept_follow_request', 'request_id uuid'),
      ('reject_follow_request', 'request_id uuid'),
      ('unfollow_shelf', 'target_user_id uuid'),
      ('remove_follower', 'follower_user_id uuid'),
      ('cancel_follow_request', 'target_user_id uuid'),
      ('search_public_shelves_by_title', 'search_query text, sort_order text, page_limit integer, page_offset integer')
  ) AS t(function_name, identity_args)
),
resolved AS (
  SELECT
    t.function_name,
    t.identity_args,
    p.oid AS function_oid,
    format(
      'public.%I(%s)',
      t.function_name,
      CASE t.function_name
        WHEN 'search_public_shelves_by_title' THEN 'text, text, integer, integer'
        ELSE 'uuid'
      END
    ) AS privilege_signature
  FROM targets AS t
  LEFT JOIN pg_proc AS p
    ON p.pronamespace = 'public'::regnamespace
   AND p.proname = t.function_name
   AND pg_get_function_identity_arguments(p.oid) = t.identity_args
)
SELECT
  '5_execute_privileges' AS audit_section,
  r.function_name,
  r.identity_args,
  (r.function_oid IS NOT NULL) AS function_exists,
  CASE
    WHEN r.function_oid IS NULL THEN NULL
    ELSE has_function_privilege('anon', r.privilege_signature, 'EXECUTE')
  END AS anon_has_execute,
  CASE
    WHEN r.function_oid IS NULL THEN NULL
    ELSE has_function_privilege('authenticated', r.privilege_signature, 'EXECUTE')
  END AS authenticated_has_execute,
  CASE
    WHEN r.function_oid IS NULL THEN NULL
    ELSE has_function_privilege('public', r.privilege_signature, 'EXECUTE')
  END AS public_role_has_execute
FROM resolved AS r
ORDER BY r.function_name;


-- 5b) ACL の直接 grantee 分解（PUBLIC=0 / anon / authenticated）
--     has_function_privilege は継承込み。こちらは ACL エントリの有無。
SELECT
  '5b_execute_acl_entries' AS audit_section,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE coalesce(pg_get_userbyid(acl.grantee), acl.grantee::text)
  END AS grantee_name,
  acl.privilege_type,
  acl.is_grantable
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(
  coalesce(p.proacl, acldefault('f', p.proowner))
) AS acl
WHERE n.nspname = 'public'
  AND p.proname IN (
    'can_view_user_items',
    'follow_shelf',
    'accept_follow_request',
    'reject_follow_request',
    'unfollow_shelf',
    'remove_follower',
    'cancel_follow_request',
    'search_public_shelves_by_title'
  )
  AND acl.privilege_type = 'EXECUTE'
ORDER BY p.proname, identity_args, grantee_name;


-- ============================================================
-- 6) search_public_shelves_by_title の存在・定義・属性
--    期待: (text, text, integer, integer) → jsonb
--          SECURITY DEFINER / STABLE / owner=postgres
-- ============================================================
SELECT
  '6_search_public_shelves_by_title' AS audit_section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS is_security_definer,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
  END AS volatility,
  p.proconfig AS config_settings,
  obj_description(p.oid, 'pg_proc') AS comment_text,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'search_public_shelves_by_title'
ORDER BY identity_args;


-- 6b) 期待シグネチャ欠落チェック
SELECT
  '6b_search_missing' AS audit_section,
  'search_public_shelves_by_title' AS function_name,
  'search_query text, sort_order text, page_limit integer, page_offset integer' AS identity_args,
  'MISSING' AS status
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_public_shelves_by_title'
    AND pg_get_function_identity_arguments(p.oid)
      = 'search_query text, sort_order text, page_limit integer, page_offset integer'
);


-- ============================================================
-- 参考) Stage3 が触る follows テーブル権限（行データは読まない）
--      期待: authenticated に SELECT あり / UPDATE・DELETE なし
-- ============================================================
SELECT
  'ref_follows_table_privs' AS audit_section,
  'authenticated' AS role_name,
  has_table_privilege('authenticated', 'public.follows', 'SELECT') AS has_select,
  has_table_privilege('authenticated', 'public.follows', 'INSERT') AS has_insert,
  has_table_privilege('authenticated', 'public.follows', 'UPDATE') AS has_update,
  has_table_privilege('authenticated', 'public.follows', 'DELETE') AS has_delete
UNION ALL
SELECT
  'ref_follows_table_privs',
  'anon',
  has_table_privilege('anon', 'public.follows', 'SELECT'),
  has_table_privilege('anon', 'public.follows', 'INSERT'),
  has_table_privilege('anon', 'public.follows', 'UPDATE'),
  has_table_privilege('anon', 'public.follows', 'DELETE');


-- 完了マーカー（最後の結果セット）
SELECT
  'audit_readonly_complete' AS audit_section,
  now() AS checked_at_utc,
  current_database() AS database_name,
  current_user AS checked_as_role;
