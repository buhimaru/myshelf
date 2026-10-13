-- myshelf Stage2: 承認済みフォローの相互閲覧（本番DB照合反映版）
-- ------------------------------------------------------------
-- 適用方法: Supabase SQL Editor でこのファイルを手動実行する。
-- このリポジトリからは自動実行しないこと。まだ本番適用しないこと。
--
-- 本番確認済み:
--   - items SELECT ポリシー名: items_select_owner_public_or_follower（1本）
--   - その roles: {public}
--   - follow_shelf(target_user_id uuid) 戻り値: follows（行型）
--   - follow_shelf 所有者: postgres
--   - UNIQUE: follows_follower_id_following_id_key
--             UNIQUE (follower_id, following_id)
--
-- 目的:
--   1. accepted なら相互に非公開 items を SELECT できる
--   2. 申請 / 承認 / 拒否 / 解除 を同一ペアロックで直列化する
--   3. follow_shelf は RETURNS public.follows のまま CREATE OR REPLACE（DROP しない）
--   4. 未ログイン(anon) / 匿名Auth / 所有者 / 承認済み相互閲覧を維持
--   5. 移行処理では items / follows の既存行を一括削除しない
--   6. authenticated の follows 直接 UPDATE/DELETE を REVOKE（SELECT は維持）
--      変更は SECURITY DEFINER RPC 経由のみ
--
-- 想定する items SELECT ポリシー集合（完全一致のいずれか）:
--   - 本番 Stage1:        { items_select_owner_public_or_follower }
--   - 本スクリプト適用済:  { items_select_mutual }
-- ------------------------------------------------------------

BEGIN;

-- ============================================================
-- 0) 前提検査（想定外なら例外 → ロールバック）
-- ============================================================
DO $$
DECLARE
  select_names text[];
  select_roles name[];
  insert_cnt int;
  update_cnt int;
  delete_cnt int;
  rls_on boolean;
  follow_oid oid;
  follow_result text;
  follow_owner name;
  uniq_ok boolean;
BEGIN
  SELECT c.relrowsecurity
  INTO rls_on
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'items';

  IF rls_on IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'ABORT: public.items で RLS が有効ではありません。';
  END IF;

  SELECT coalesce(array_agg(policyname ORDER BY policyname), ARRAY[]::text[])
  INTO select_names
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'items'
    AND cmd = 'SELECT';

  -- 本番 Stage1 名、または本スクリプト適用済み名のみ許可
  IF NOT (
    select_names = ARRAY['items_select_owner_public_or_follower']::text[]
    OR select_names = ARRAY['items_select_mutual']::text[]
  ) THEN
    RAISE EXCEPTION
      'ABORT: items の SELECT ポリシーが想定外です。found=% expected one of: {items_select_owner_public_or_follower}, {items_select_mutual}.',
      select_names;
  END IF;

  -- 置換前ポリシーの roles が本番どおり {public} であること
  SELECT roles
  INTO select_roles
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'items'
    AND cmd = 'SELECT'
    AND policyname = select_names[1];

  IF select_roles IS DISTINCT FROM ARRAY['public']::name[] THEN
    RAISE EXCEPTION
      'ABORT: items SELECT ポリシー roles が想定外です。policy=% roles=% expected={public}',
      select_names[1], select_roles;
  END IF;

  SELECT count(*) INTO insert_cnt
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'items' AND cmd = 'INSERT';

  SELECT count(*) INTO update_cnt
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'items' AND cmd = 'UPDATE';

  SELECT count(*) INTO delete_cnt
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'items' AND cmd = 'DELETE';

  IF insert_cnt < 1 OR update_cnt < 1 OR delete_cnt < 1 THEN
    RAISE EXCEPTION
      'ABORT: items の CRUD ポリシー不足 (INSERT=%, UPDATE=%, DELETE=%)',
      insert_cnt, update_cnt, delete_cnt;
  END IF;

  SELECT p.oid,
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner)
  INTO follow_oid, follow_result, follow_owner
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'follow_shelf'
    AND pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid';

  IF follow_oid IS NULL THEN
    RAISE EXCEPTION
      'ABORT: public.follow_shelf(target_user_id uuid) が見つかりません。';
  END IF;

  IF follow_result IS DISTINCT FROM 'follows'
     AND follow_result IS DISTINCT FROM 'public.follows' THEN
    RAISE EXCEPTION
      'ABORT: follow_shelf の戻り値が public.follows ではありません。found=%。DROP せず型変更もしません。',
      follow_result;
  END IF;

  IF follow_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      'ABORT: follow_shelf の OWNER が postgres ではありません。found=%',
      follow_owner;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    WHERE c.conrelid = 'public.follows'::regclass
      AND c.conname = 'follows_follower_id_following_id_key'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (follower_id, following_id)'
  )
  INTO uniq_ok;

  IF uniq_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'ABORT: follows_follower_id_following_id_key (UNIQUE (follower_id, following_id)) が見つかりません。';
  END IF;

  -- follows のテーブル権限: SELECT は維持前提。UPDATE/DELETE は後段で REVOKE する。
  -- 事前にテーブルが存在し SELECT 可能ロール想定であることを記録するのみ。
  IF NOT has_table_privilege('authenticated', 'public.follows', 'SELECT') THEN
    RAISE EXCEPTION
      'ABORT: authenticated に public.follows の SELECT がありません（状態表示が壊れます）。';
  END IF;
END $$;

-- ============================================================
-- 0b) authenticated からの follows 直接 UPDATE/DELETE を禁止
--     SELECT は維持。INSERT は触らない（follow_shelf は DEFINER）。
--     既存 follows / items 行は削除しない。
-- ============================================================
REVOKE UPDATE, DELETE ON TABLE public.follows FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.follows FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.follows FROM PUBLIC;

-- ============================================================
-- 1) ペア単位ロック（申請・承認・拒否・解除で共有）
-- ============================================================
CREATE OR REPLACE FUNCTION public.myshelf_follow_pair_lock(
  user_a uuid,
  user_b uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  left_id uuid;
  right_id uuid;
BEGIN
  IF user_a IS NULL OR user_b IS NULL THEN
    RAISE EXCEPTION 'invalid follow pair';
  END IF;

  IF user_a < user_b THEN
    left_id := user_a;
    right_id := user_b;
  ELSE
    left_id := user_b;
    right_id := user_a;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(left_id::text || ':' || right_id::text, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.myshelf_follow_pair_lock(uuid, uuid) IS
  'follows 二者間操作のトランザクション advisory lock';

-- クライアント直実行を禁止（PUBLIC / anon / authenticated すべてから剝奪）
REVOKE ALL ON FUNCTION public.myshelf_follow_pair_lock(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.myshelf_follow_pair_lock(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.myshelf_follow_pair_lock(uuid, uuid) FROM authenticated;
ALTER FUNCTION public.myshelf_follow_pair_lock(uuid, uuid) OWNER TO postgres;

-- ============================================================
-- 2) 相互閲覧判定（boolean のみ。行データは返さない）
-- ============================================================
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
            AND (
              (f.follower_id = auth.uid() AND f.following_id = owner_id)
              OR (f.follower_id = owner_id AND f.following_id = auth.uid())
            )
        ) THEN true
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.can_view_user_items(uuid) IS
  'items SELECT 用: 所有者 / 公開棚 / 本登録かつ承認済み相互フォロー';

-- TO public の SELECT ポリシーから呼ぶため、EXECUTE は PUBLIC に付与する。
-- 返り値は boolean のみ。相互閲覧は JWT is_anonymous = 'false' のときだけ。
-- いったん全ロールから剝奪してから PUBLIC のみ再付与（anon 個別GRANTの残留を防ぐ）
REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_user_items(uuid) TO PUBLIC;
ALTER FUNCTION public.can_view_user_items(uuid) OWNER TO postgres;

-- ============================================================
-- 3) items SELECT を想定名だけ置換（CRUD ポリシーは触らない）
--    本番 roles={public} に合わせ、新ポリシーも TO public
-- ============================================================
DO $$
DECLARE
  select_names text[];
  select_roles name[];
  pol_name text;
BEGIN
  SELECT coalesce(array_agg(policyname ORDER BY policyname), ARRAY[]::text[])
  INTO select_names
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'items'
    AND cmd = 'SELECT';

  IF select_names = ARRAY['items_select_owner_public_or_follower']::text[] THEN
    pol_name := 'items_select_owner_public_or_follower';
  ELSIF select_names = ARRAY['items_select_mutual']::text[] THEN
    pol_name := 'items_select_mutual';
  ELSE
    RAISE EXCEPTION
      'ABORT: SELECT ポリシー置換前の再検査失敗。found=%',
      select_names;
  END IF;

  SELECT roles
  INTO select_roles
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'items'
    AND cmd = 'SELECT'
    AND policyname = pol_name;

  IF select_roles IS DISTINCT FROM ARRAY['public']::name[] THEN
    RAISE EXCEPTION
      'ABORT: 置換対象 SELECT の roles が {public} ではありません。policy=% roles=%',
      pol_name, select_roles;
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.items', pol_name);
END $$;

CREATE POLICY items_select_mutual
ON public.items
FOR SELECT
TO public
USING (public.can_view_user_items(user_id));

DO $$
DECLARE
  insert_cnt int;
  update_cnt int;
  delete_cnt int;
  select_names text[];
  select_roles name[];
BEGIN
  SELECT count(*) INTO insert_cnt
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'items' AND cmd = 'INSERT';
  SELECT count(*) INTO update_cnt
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'items' AND cmd = 'UPDATE';
  SELECT count(*) INTO delete_cnt
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'items' AND cmd = 'DELETE';

  SELECT coalesce(array_agg(policyname ORDER BY policyname), ARRAY[]::text[])
  INTO select_names
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'items'
    AND cmd = 'SELECT';

  SELECT roles
  INTO select_roles
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'items'
    AND cmd = 'SELECT'
    AND policyname = 'items_select_mutual';

  IF insert_cnt < 1 OR update_cnt < 1 OR delete_cnt < 1 THEN
    RAISE EXCEPTION
      'ABORT: SELECT 置換後に CRUD ポリシーが欠けました (INSERT=%, UPDATE=%, DELETE=%)',
      insert_cnt, update_cnt, delete_cnt;
  END IF;

  IF select_names IS DISTINCT FROM ARRAY['items_select_mutual']::text[] THEN
    RAISE EXCEPTION
      'ABORT: SELECT ポリシー最終状態が想定外。found=%',
      select_names;
  END IF;

  IF select_roles IS DISTINCT FROM ARRAY['public']::name[] THEN
    RAISE EXCEPTION
      'ABORT: items_select_mutual の roles が {public} ではありません。found=%',
      select_roles;
  END IF;
END $$;

-- ============================================================
-- 4) unfollow_shelf（双方向削除・fail-closed・ペアロック）
-- ============================================================
CREATE OR REPLACE FUNCTION public.unfollow_shelf(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  anon_claim text;
  remaining int;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  anon_claim := auth.jwt() ->> 'is_anonymous';
  IF anon_claim IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'only permanent users can unfollow'
      USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL OR target_user_id = me THEN
    RAISE EXCEPTION 'invalid target_user_id';
  END IF;

  PERFORM public.myshelf_follow_pair_lock(me, target_user_id);

  DELETE FROM public.follows
  WHERE (follower_id = me AND following_id = target_user_id)
     OR (follower_id = target_user_id AND following_id = me);

  SELECT count(*)
  INTO remaining
  FROM public.follows
  WHERE (follower_id = me AND following_id = target_user_id)
     OR (follower_id = target_user_id AND following_id = me);

  IF remaining <> 0 THEN
    RAISE EXCEPTION
      'unfollow failed: follow rows still remain between the pair (count=%)',
      remaining;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.unfollow_shelf(uuid) IS
  'フォロー関係解除。双方向削除 + ペアロック。';

-- CREATE/REPLACE 後の PUBLIC 既定付与と、Stage1 の anon 個別GRANTを除去
REVOKE ALL ON FUNCTION public.unfollow_shelf(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unfollow_shelf(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.unfollow_shelf(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_shelf(uuid) TO authenticated;
ALTER FUNCTION public.unfollow_shelf(uuid) OWNER TO postgres;

-- ============================================================
-- 5) accept_follow_request（承認をペアロック配下へ）
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_follow_request(request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  anon_claim text;
  req public.follows%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  anon_claim := auth.jwt() ->> 'is_anonymous';
  IF anon_claim IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'only permanent users can accept follow requests'
      USING ERRCODE = '42501';
  END IF;

  IF request_id IS NULL THEN
    RAISE EXCEPTION 'invalid request_id';
  END IF;

  SELECT *
  INTO req
  FROM public.follows AS f
  WHERE f.id = request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'follow request not found';
  END IF;

  IF req.following_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'only the shelf owner can accept this request'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.myshelf_follow_pair_lock(me, req.follower_id);

  SELECT *
  INTO req
  FROM public.follows AS f
  WHERE f.id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'follow request not found';
  END IF;

  IF req.following_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'only the shelf owner can accept this request'
      USING ERRCODE = '42501';
  END IF;

  IF req.status = 'accepted' THEN
    RETURN 'accepted';
  END IF;

  IF req.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'follow request is not pending (status=%)', req.status;
  END IF;

  UPDATE public.follows
  SET status = 'accepted'
  WHERE id = request_id
    AND following_id = me
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept failed: request was concurrently modified';
  END IF;

  RETURN 'accepted';
END;
$$;

COMMENT ON FUNCTION public.accept_follow_request(uuid) IS
  'pending フォロー申請の承認。ペアロック下で pending→accepted。';

REVOKE ALL ON FUNCTION public.accept_follow_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_follow_request(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.accept_follow_request(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_follow_request(uuid) TO authenticated;
ALTER FUNCTION public.accept_follow_request(uuid) OWNER TO postgres;

-- ============================================================
-- 6) reject_follow_request（拒否も同じロックで直列化）
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_follow_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  anon_claim text;
  req public.follows%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  anon_claim := auth.jwt() ->> 'is_anonymous';
  IF anon_claim IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'only permanent users can reject follow requests'
      USING ERRCODE = '42501';
  END IF;

  IF request_id IS NULL THEN
    RAISE EXCEPTION 'invalid request_id';
  END IF;

  SELECT *
  INTO req
  FROM public.follows AS f
  WHERE f.id = request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'follow request not found';
  END IF;

  IF req.following_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'only the shelf owner can reject this request'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.myshelf_follow_pair_lock(me, req.follower_id);

  SELECT *
  INTO req
  FROM public.follows AS f
  WHERE f.id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF req.following_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'only the shelf owner can reject this request'
      USING ERRCODE = '42501';
  END IF;

  IF req.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'follow request is not pending (status=%)', req.status;
  END IF;

  DELETE FROM public.follows
  WHERE id = request_id
    AND following_id = me
    AND status = 'pending';
END;
$$;

COMMENT ON FUNCTION public.reject_follow_request(uuid) IS
  'pending フォロー申請の拒否。ペアロック下で該当行のみ削除。';

REVOKE ALL ON FUNCTION public.reject_follow_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_follow_request(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reject_follow_request(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_follow_request(uuid) TO authenticated;
ALTER FUNCTION public.reject_follow_request(uuid) OWNER TO postgres;

-- ============================================================
-- 7) follow_shelf
--    RETURNS public.follows のまま CREATE OR REPLACE（DROP しない）
--    UI は data.status を読むため行型返却と互換
--
--    重要: Stage1 の follows_enforce_update_rules は
--    pending→accepted 以外の UPDATE を禁止する。
--    そのためここでも ON CONFLICT DO UPDATE は使わず、
--    既存行は読み取り返却のみ / 新規のみ INSERT する。
--    pending→accepted は accept_follow_request に限定する。
-- ============================================================
CREATE OR REPLACE FUNCTION public.follow_shelf(target_user_id uuid)
RETURNS public.follows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  anon_claim text;
  target_is_public boolean;
  next_status text;
  result_row public.follows;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  anon_claim := auth.jwt() ->> 'is_anonymous';
  IF anon_claim IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'only permanent users can follow'
      USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL OR target_user_id = me THEN
    RAISE EXCEPTION 'invalid target_user_id';
  END IF;

  PERFORM public.myshelf_follow_pair_lock(me, target_user_id);

  -- どちらの向きでも accepted があれば追加申請不要。
  -- UI 互換のため follows 行を返す（自分起点を優先）。
  SELECT f.*
  INTO result_row
  FROM public.follows AS f
  WHERE f.status = 'accepted'
    AND (
      (f.follower_id = me AND f.following_id = target_user_id)
      OR (f.follower_id = target_user_id AND f.following_id = me)
    )
  ORDER BY CASE WHEN f.follower_id = me THEN 0 ELSE 1 END
  LIMIT 1;

  IF FOUND THEN
    RETURN result_row;
  END IF;

  -- 自分が送った既存行があれば UPDATE せずそのまま返す
  -- （トリガーが pending→accepted 以外の更新を拒否するため）
  SELECT f.*
  INTO result_row
  FROM public.follows AS f
  WHERE f.follower_id = me
    AND f.following_id = target_user_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN result_row;
  END IF;

  SELECT p.is_public
  INTO target_is_public
  FROM public.profiles AS p
  WHERE p.id = target_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found';
  END IF;

  next_status := CASE WHEN target_is_public IS TRUE THEN 'accepted' ELSE 'pending' END;

  -- 新規 INSERT のみ。競合時は UPDATE せず既存行を返す。
  BEGIN
    INSERT INTO public.follows (follower_id, following_id, status)
    VALUES (me, target_user_id, next_status)
    RETURNING * INTO result_row;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT f.*
      INTO result_row
      FROM public.follows AS f
      WHERE f.follower_id = me
        AND f.following_id = target_user_id;

      IF result_row.id IS NULL THEN
        RAISE EXCEPTION 'follow_shelf failed: unique_violation but row not found';
      END IF;
  END;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'follow_shelf failed: no follows row returned';
  END IF;

  RETURN result_row;
END;
$$;

COMMENT ON FUNCTION public.follow_shelf(uuid) IS
  '棚フォロー申請。公開=accepted / 非公開=pending。RETURNS public.follows。UPDATE せず INSERT のみ（enforce_update_rules と両立）。';

-- 既存 follow_shelf は CREATE OR REPLACE でも権限が残り得るため、anon/PUBLIC を明示 REVOKE
REVOKE ALL ON FUNCTION public.follow_shelf(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.follow_shelf(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.follow_shelf(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.follow_shelf(uuid) TO authenticated;
ALTER FUNCTION public.follow_shelf(uuid) OWNER TO postgres;

-- ============================================================
-- 8) 権限・所有者・戻り値の最終検証
-- ============================================================
DO $$
DECLARE
  fn record;
  bad_owner text;
  follow_result text;
BEGIN
  SELECT pg_get_function_result(p.oid)
  INTO follow_result
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'follow_shelf'
    AND pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid';

  IF follow_result IS DISTINCT FROM 'follows'
     AND follow_result IS DISTINCT FROM 'public.follows' THEN
    RAISE EXCEPTION
      'ABORT: 置換後の follow_shelf 戻り値が public.follows ではありません。found=%',
      follow_result;
  END IF;

  FOR fn IN
    SELECT p.proname, pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'can_view_user_items',
        'unfollow_shelf',
        'follow_shelf',
        'myshelf_follow_pair_lock',
        'accept_follow_request',
        'reject_follow_request'
      )
  LOOP
    IF fn.owner IS DISTINCT FROM 'postgres' THEN
      bad_owner := coalesce(bad_owner || ', ', '') || fn.proname || '=' || fn.owner;
    END IF;
  END LOOP;

  IF bad_owner IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORT: SECURITY DEFINER OWNER が postgres ではありません: %',
      bad_owner;
  END IF;

  -- 実効権限で判定（PUBLIC 付与は anon からも実行可能になる）
  IF has_function_privilege('anon', 'public.follow_shelf(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.unfollow_shelf(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_follow_request(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reject_follow_request(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION
      'ABORT: anon が follow 系 RPC を実行できます（PUBLIC または anon への EXECUTE が残存）。';
  END IF;

  IF NOT (
    has_function_privilege('authenticated', 'public.follow_shelf(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.unfollow_shelf(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.accept_follow_request(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.reject_follow_request(uuid)', 'EXECUTE')
  ) THEN
    RAISE EXCEPTION
      'ABORT: authenticated に follow 系 RPC の EXECUTE がありません。';
  END IF;

  -- ACL 上の PUBLIC 直付与（grantee=0）が残っていないこと
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'follow_shelf',
        'unfollow_shelf',
        'accept_follow_request',
        'reject_follow_request'
      )
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION
      'ABORT: follow 系 RPC の ACL に PUBLIC EXECUTE が残っています。';
  END IF;

  -- anon ロールへの直接 EXECUTE 付与が残っていないこと
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_roles AS r ON r.rolname = 'anon'
    CROSS JOIN LATERAL aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'follow_shelf',
        'unfollow_shelf',
        'accept_follow_request',
        'reject_follow_request'
      )
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee = r.oid
  ) THEN
    RAISE EXCEPTION
      'ABORT: follow 系 RPC の ACL に anon への直接 EXECUTE が残っています。';
  END IF;

  -- 公開棚閲覧用: can_view_user_items は PUBLIC から実行できること
  IF NOT has_function_privilege('anon', 'public.can_view_user_items(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'ABORT: anon が can_view_user_items を実行できません（未ログイン閲覧が壊れます）。';
  END IF;

  -- follows: SELECT 維持、直接 UPDATE/DELETE 禁止
  IF NOT has_table_privilege('authenticated', 'public.follows', 'SELECT') THEN
    RAISE EXCEPTION
      'ABORT: authenticated の follows SELECT が失われました。';
  END IF;

  IF has_table_privilege('authenticated', 'public.follows', 'UPDATE') THEN
    RAISE EXCEPTION
      'ABORT: authenticated が public.follows を直接 UPDATE できます。REVOKE を確認してください。';
  END IF;

  IF has_table_privilege('authenticated', 'public.follows', 'DELETE') THEN
    RAISE EXCEPTION
      'ABORT: authenticated が public.follows を直接 DELETE できます。REVOKE を確認してください。';
  END IF;

  IF has_table_privilege('anon', 'public.follows', 'UPDATE')
     OR has_table_privilege('anon', 'public.follows', 'DELETE') THEN
    RAISE EXCEPTION
      'ABORT: anon が public.follows を直接 UPDATE/DELETE できます。';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- 適用前確認用（このファイルでは実行しない）
-- ============================================================
-- SELECT pg_get_function_result(p.oid) AS result_type,
--        pg_get_userbyid(p.proowner) AS owner
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname = 'follow_shelf'
--   AND pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid';
