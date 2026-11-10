-- patch: search_public_shelves_by_title の作品名下限を 2→1 文字へ
-- 適用タイミング: アプリ側 SHELF_SEARCH_MIN_LENGTH=1 と同時（本番承認後）
-- 変更点: 文字数ガードのみ。検索ロジック・権限・返却形は変更しない。

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

  -- 文字数: 1〜100。範囲外は空結果（例外にしない）
  IF char_length(v_query) < 1 OR char_length(v_query) > 100 THEN
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
  '公開棚タイトル検索。is_public IS TRUE のみ。1ユーザー1件。表示名は解決済み。username は返さない。作品名 1〜100 文字。';

REVOKE ALL ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) TO authenticated;
ALTER FUNCTION public.search_public_shelves_by_title(text, text, integer, integer) OWNER TO postgres;
