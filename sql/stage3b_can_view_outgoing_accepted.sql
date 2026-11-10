-- myshelf Stage3b: can_view_user_items を「閲覧者→所有者の accepted のみ」に変更
-- ------------------------------------------------------------
-- 適用対象: 隔離検証 DB（または明示承認後の本番）
-- このリポジトリからは自動実行しない。SQL Editor / docker exec で手動適用。
--
-- 変更範囲:
--   public.can_view_user_items(owner_id uuid) の定義のみ
--
-- 変更しないもの:
--   テーブル構造 / 既存データ / RLS ポリシー定義 /
--   follow_shelf / accept_follow_request / unfollow_shelf / remove_follower 等の RPC
--
-- 閲覧条件（本変更後）:
--   1) 所有者本人
--   2) 所有者プロファイルが is_public
--   3) 本登録（JWT is_anonymous = 'false'）かつ
--      accepted かつ follower_id = auth.uid() かつ following_id = owner_id
--
-- 非公開同士の自動相互フォローは accept_follow_request 側の既存仕様のまま。
-- ------------------------------------------------------------

BEGIN;

DO $$
DECLARE
  fn_oid oid;
  is_definer boolean;
  vol text;
  owner_name text;
BEGIN
  SELECT p.oid, p.prosecdef, p.provolatile::text, pg_get_userbyid(p.proowner)
  INTO fn_oid, is_definer, vol, owner_name
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'can_view_user_items'
    AND pg_get_function_identity_arguments(p.oid) = 'owner_id uuid';

  IF fn_oid IS NULL THEN
    RAISE EXCEPTION
      'ABORT: public.can_view_user_items(owner_id uuid) が見つかりません。';
  END IF;

  IF is_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: can_view_user_items が SECURITY DEFINER ではありません。';
  END IF;

  IF vol IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION
      'ABORT: can_view_user_items の volatility が STABLE ではありません。found=%',
      vol;
  END IF;

  IF owner_name IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      'ABORT: can_view_user_items の所有者が postgres ではありません。found=%',
      owner_name;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_view_user_items(owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN owner_id IS NULL THEN false
      WHEN auth.uid() IS NOT NULL
        AND auth.uid() = owner_id THEN true
      WHEN EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = owner_id
          AND p.is_public IS TRUE
      ) THEN true
      WHEN auth.uid() IS NOT NULL
        AND (auth.jwt() ->> 'is_anonymous') = 'false'
        AND EXISTS (
          SELECT 1
          FROM public.follows AS f
          WHERE f.status = 'accepted'
            AND f.follower_id = auth.uid()
            AND f.following_id = owner_id
        )
      THEN true
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.can_view_user_items(uuid) IS
  'items SELECT 用: 所有者 / 公開棚 / 本登録かつ閲覧者→所有者の承認済みフォロー';

-- 既存と同じ EXECUTE 権限形状を維持
REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_user_items(uuid) TO PUBLIC;
ALTER FUNCTION public.can_view_user_items(uuid) OWNER TO postgres;

DO $$
DECLARE
  select_names text[];
  select_roles name[];
  can_exec_anon boolean;
  can_exec_auth boolean;
BEGIN
  SELECT coalesce(array_agg(policyname ORDER BY policyname), ARRAY[]::text[])
  INTO select_names
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'items'
    AND cmd = 'SELECT';

  IF select_names IS DISTINCT FROM ARRAY['items_select_mutual']::text[] THEN
    RAISE EXCEPTION
      'ABORT: items SELECT ポリシーが想定外です（本スクリプトはポリシーを変更しません）。found=%',
      select_names;
  END IF;

  SELECT roles
  INTO select_roles
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'items'
    AND cmd = 'SELECT'
    AND policyname = 'items_select_mutual';

  IF select_roles IS DISTINCT FROM ARRAY['public']::name[] THEN
    RAISE EXCEPTION
      'ABORT: items_select_mutual の roles が想定外です。roles=%',
      select_roles;
  END IF;

  can_exec_anon := has_function_privilege(
    'anon',
    'public.can_view_user_items(uuid)',
    'EXECUTE'
  );
  can_exec_auth := has_function_privilege(
    'authenticated',
    'public.can_view_user_items(uuid)',
    'EXECUTE'
  );

  IF NOT can_exec_anon OR NOT can_exec_auth THEN
    RAISE EXCEPTION
      'ABORT: can_view_user_items の EXECUTE 権限が不足しています。anon=% authenticated=%',
      can_exec_anon, can_exec_auth;
  END IF;
END $$;

COMMIT;
