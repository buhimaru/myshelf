-- myshelf Stage5: 公開棚のタイトル検索（読み取り専用）
-- ------------------------------------------------------------
-- 適用方法: Supabase SQL Editor でこのファイルを手動実行する。
-- このリポジトリからは自動実行しないこと。
--
-- 仕様:
--   - items.title の部分一致（ILIKE）
--   - 全ジャンル横断（category 条件なし）
--   - 結果は公開棚の所有者単位（1 user = 1 件）
--   - profiles.is_public IS TRUE のみ（承認フォロワーでも非公開は返さない）
--   - 並び: newest = 一致作品の最新 created_at 降順
--           oldest = 一致作品の最古 created_at 昇順
--           同日時は item_id / user_id で安定化
--   - 未ログイン（anon）でも実行可
--   - 表示名はアプリの resolvePublicDisplayName と同等に RPC 側で解決
--     （生の username / メール由来値は JSON に出さない）
--
-- 非変更:
--   - 既存テーブル定義 / RLS / follows / 認証 RPC は変更しない
--   - items / profiles / follows の行は更新・削除しない
--
-- 戻り値 (jsonb) — 常に1オブジェクト（0件・ページ外でも total_count を返す）:
--   {
--     "total_count": <条件に合う公開棚数>,
--     "limit": <実際に使った limit>,
--     "offset": <実際に使った offset>,
--     "sort_order": "newest" | "oldest",
--     "query": <trim 後の検索語>,
--     "rows": [ {
--         "user_id",
--         "display_name",   -- 解決済み（未設定時は「名前未設定」）。username は含めない
--         "representative_title", "representative_category",
--         "representative_created_at", "match_count"
--       }, ... ]
--   }
-- ------------------------------------------------------------

BEGIN;

-- ------------------------------------------------------------
-- 表示名解決（utils/shelfDisplay.ts の resolvePublicDisplayName と同等）
--   - 空 → 名前未設定
--   - @ を含む（メール形式）→ 名前未設定
--   - display_name が username と同一（レガシーミラー）→ 名前未設定
--   - それ以外は trim 済み display_name
-- username 自体は呼び出し元が返却しないこと。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.myshelf_resolve_public_display_name(
  raw_display_name text,
  raw_username text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN btrim(COALESCE(raw_display_name, '')) = '' THEN '名前未設定'
    WHEN position('@' IN btrim(raw_display_name)) > 0 THEN '名前未設定'
    WHEN btrim(COALESCE(raw_username, '')) <> ''
      AND btrim(raw_display_name) = btrim(raw_username) THEN '名前未設定'
    ELSE btrim(raw_display_name)
  END;
$$;

COMMENT ON FUNCTION public.myshelf_resolve_public_display_name(text, text) IS
  '公開表示名の解決。アプリ resolvePublicDisplayName と同等。未設定は「名前未設定」。';

-- ヘルパーは public に置く（既存の myshelf_follow_pair_lock と同様）。
-- 非公開スキーマ新設は行わない。クライアント実行は REVOKE で防ぐ。
REVOKE ALL ON FUNCTION public.myshelf_resolve_public_display_name(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.myshelf_resolve_public_display_name(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.myshelf_resolve_public_display_name(text, text) FROM authenticated;
ALTER FUNCTION public.myshelf_resolve_public_display_name(text, text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.search_public_shelves_by_title(
  search_query text,
  sort_order text DEFAULT 'newest',
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := btrim(COALESCE(search_query, ''));
  v_sort text;
  v_limit integer;
  v_offset integer;
  v_pattern text;
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF sort_order = 'oldest' THEN
    v_sort := 'oldest';
  ELSE
    v_sort := 'newest';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(page_limit, 20), 1), 50);
  v_offset := GREATEST(COALESCE(page_offset, 0), 0);

  -- 文字数: 2〜100。範囲外は空結果（例外にしない）
  IF char_length(v_query) < 2 OR char_length(v_query) > 100 THEN
    RETURN jsonb_build_object(
      'total_count', 0,
      'limit', v_limit,
      'offset', v_offset,
      'sort_order', v_sort,
      'query', v_query,
      'rows', '[]'::jsonb
    );
  END IF;

  -- ユーザ入力の % _ \ をワイルドカードにしない
  v_pattern :=
    '%'
    || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_')
    || '%';

  -- follows / can_view_user_items は参照しない
  WITH matched_items AS (
    SELECT
      i.user_id AS owner_id,
      i.id AS item_id,
      i.title AS item_title,
      i.category AS item_category,
      i.created_at AS item_created_at
    FROM public.items AS i
    INNER JOIN public.profiles AS p_owner
      ON p_owner.id = i.user_id
     AND p_owner.is_public IS TRUE
    WHERE i.title ILIKE v_pattern ESCAPE E'\\'
  ),
  ranked AS (
    SELECT
      m.owner_id,
      m.item_id,
      m.item_title,
      m.item_category,
      m.item_created_at,
      COUNT(*) OVER (PARTITION BY m.owner_id)::integer AS owner_match_count,
      CASE
        WHEN v_sort = 'oldest' THEN
          MIN(m.item_created_at) OVER (PARTITION BY m.owner_id)
        ELSE
          MAX(m.item_created_at) OVER (PARTITION BY m.owner_id)
      END AS owner_sort_at,
      ROW_NUMBER() OVER (
        PARTITION BY m.owner_id
        ORDER BY
          CASE WHEN v_sort = 'oldest' THEN m.item_created_at END ASC NULLS LAST,
          CASE WHEN v_sort = 'newest' THEN m.item_created_at END DESC NULLS LAST,
          CASE WHEN v_sort = 'oldest' THEN m.item_id END ASC,
          CASE WHEN v_sort = 'newest' THEN m.item_id END DESC
      ) AS owner_row_num
    FROM matched_items AS m
  ),
  one_per_owner AS (
    SELECT
      r.owner_id,
      r.item_title AS rep_title,
      r.item_category AS rep_category,
      r.owner_sort_at,
      r.owner_match_count
    FROM ranked AS r
    WHERE r.owner_row_num = 1
  ),
  assembled AS (
    SELECT
      o.owner_id,
      public.myshelf_resolve_public_display_name(
        p.display_name,
        p.username
      ) AS safe_display_name,
      o.rep_title,
      o.rep_category,
      o.owner_sort_at,
      o.owner_match_count
    FROM one_per_owner AS o
    INNER JOIN public.profiles AS p
      ON p.id = o.owner_id
     AND p.is_public IS TRUE
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS shelf_total FROM assembled
  ),
  page AS (
    SELECT
      a.owner_id,
      a.safe_display_name,
      a.rep_title,
      a.rep_category,
      a.owner_sort_at,
      a.owner_match_count
    FROM assembled AS a
    ORDER BY
      CASE WHEN v_sort = 'oldest' THEN a.owner_sort_at END ASC NULLS LAST,
      CASE WHEN v_sort = 'newest' THEN a.owner_sort_at END DESC NULLS LAST,
      a.owner_id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    (SELECT c.shelf_total FROM counted AS c),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', pg.owner_id,
            'display_name', pg.safe_display_name,
            'representative_title', pg.rep_title,
            'representative_category', pg.rep_category,
            'representative_created_at', pg.owner_sort_at,
            'match_count', pg.owner_match_count
          )
          ORDER BY
            CASE WHEN v_sort = 'oldest' THEN pg.owner_sort_at END ASC NULLS LAST,
            CASE WHEN v_sort = 'newest' THEN pg.owner_sort_at END DESC NULLS LAST,
            pg.owner_id ASC
        )
        FROM page AS pg
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'total_count', COALESCE(v_total, 0),
    'limit', v_limit,
    'offset', v_offset,
    'sort_order', v_sort,
    'query', v_query,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) IS
  '公開棚タイトル検索。is_public IS TRUE のみ。1ユーザー1件。表示名は解決済み。username は返さない。';

REVOKE ALL ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) TO authenticated;
ALTER FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) OWNER TO postgres;

DO $$
DECLARE
  fn_sig text := 'public.search_public_shelves_by_title(text, text, integer, integer)';
  helper_sig text := 'public.myshelf_resolve_public_display_name(text, text)';
  fn_owner text;
  helper_owner text;
  sample jsonb;
  row_obj jsonb;
  dn text;
BEGIN
  SELECT pg_get_userbyid(p.proowner)
  INTO fn_owner
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_public_shelves_by_title'
    AND pg_get_function_identity_arguments(p.oid)
      = 'search_query text, sort_order text, page_limit integer, page_offset integer';

  IF fn_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      'ABORT: search_public_shelves_by_title の OWNER が postgres ではありません。found=%',
      fn_owner;
  END IF;

  SELECT pg_get_userbyid(p.proowner)
  INTO helper_owner
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'myshelf_resolve_public_display_name'
    AND pg_get_function_identity_arguments(p.oid) = 'raw_display_name text, raw_username text';

  IF helper_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      'ABORT: myshelf_resolve_public_display_name の OWNER が postgres ではありません。found=%',
      helper_owner;
  END IF;

  IF NOT has_function_privilege('anon', fn_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: anon に search_public_shelves_by_title の EXECUTE がありません。';
  END IF;

  IF NOT has_function_privilege('authenticated', fn_sig, 'EXECUTE') THEN
    RAISE EXCEPTION
      'ABORT: authenticated に search_public_shelves_by_title の EXECUTE がありません。';
  END IF;

  -- ヘルパーは anon / authenticated / PUBLIC から実行できないこと
  IF has_function_privilege('anon', helper_sig, 'EXECUTE')
     OR has_function_privilege('authenticated', helper_sig, 'EXECUTE') THEN
    RAISE EXCEPTION
      'ABORT: myshelf_resolve_public_display_name が anon/authenticated から実行できます。';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND (
        (
          p.proname = 'search_public_shelves_by_title'
          AND pg_get_function_identity_arguments(p.oid)
            = 'search_query text, sort_order text, page_limit integer, page_offset integer'
        )
        OR (
          p.proname = 'myshelf_resolve_public_display_name'
          AND pg_get_function_identity_arguments(p.oid)
            = 'raw_display_name text, raw_username text'
        )
      )
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION
      'ABORT: Stage5 関数の ACL に PUBLIC EXECUTE が残っています。';
  END IF;

  -- 表示名解決ユニットテスト（アプリ同等）
  IF public.myshelf_resolve_public_display_name(NULL, NULL)
       IS DISTINCT FROM '名前未設定'
     OR public.myshelf_resolve_public_display_name('  ', 'x')
       IS DISTINCT FROM '名前未設定'
     OR public.myshelf_resolve_public_display_name('user@example.com', 'user')
       IS DISTINCT FROM '名前未設定'
     OR public.myshelf_resolve_public_display_name('legacyuser', 'legacyuser')
       IS DISTINCT FROM '名前未設定'
     OR public.myshelf_resolve_public_display_name('安吾', 'ango')
       IS DISTINCT FROM '安吾'
  THEN
    RAISE EXCEPTION 'ABORT: myshelf_resolve_public_display_name の解決結果が想定外です。';
  END IF;

  sample := public.search_public_shelves_by_title('a', 'newest', 20, 0);
  IF (sample ->> 'total_count') IS DISTINCT FROM '0'
     OR jsonb_typeof(sample -> 'rows') IS DISTINCT FROM 'array'
     OR jsonb_array_length(sample -> 'rows') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ABORT: 1文字検索の戻り値が想定外です。found=%', sample;
  END IF;

  sample := public.search_public_shelves_by_title(repeat('あ', 101), 'newest', 20, 0);
  IF (sample ->> 'total_count') IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'ABORT: 101文字検索の total_count が 0 ではありません。found=%', sample;
  END IF;

  sample := public.search_public_shelves_by_title('100%_test\x', 'oldest', 5, 0);
  IF NOT (sample ? 'total_count') OR NOT (sample ? 'rows') THEN
    RAISE EXCEPTION 'ABORT: メタ文字検索の戻り値が不正です。found=%', sample;
  END IF;

  sample := public.search_public_shelves_by_title('テスト', 'newest', 20, 100000);
  IF NOT (sample ? 'total_count')
     OR jsonb_typeof(sample -> 'rows') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'ABORT: 大きな offset の戻り値が不正です。found=%', sample;
  END IF;

  -- 実データがある場合: username キー無し・display_name に @ 無し
  -- （anon / authenticated 実ロールでの実行は stage5_dry_run.sql で別トランザクション検証）
  sample := public.search_public_shelves_by_title('テスト', 'newest', 50, 0);
  FOR row_obj IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(sample -> 'rows', '[]'::jsonb)) AS t(value)
  LOOP
    IF row_obj ? 'username' THEN
      RAISE EXCEPTION
        'ABORT: 検索結果に username が含まれています。found=%',
        row_obj;
    END IF;

    dn := row_obj ->> 'display_name';
    IF dn IS NULL OR dn = '' THEN
      RAISE EXCEPTION 'ABORT: display_name が空です。found=%', row_obj;
    END IF;
    IF position('@' IN dn) > 0 THEN
      RAISE EXCEPTION
        'ABORT: display_name にメール形式の値が含まれています。found=%',
        row_obj;
    END IF;
  END LOOP;
END $$;

COMMIT;
