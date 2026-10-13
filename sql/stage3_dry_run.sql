-- myshelf Stage3 DRY RUN: 非対称フォロー閲覧 + フォロー解除 / フォロワー解除
-- ------------------------------------------------------------
-- 適用方法: Supabase SQL Editor でこのファイルを手動実行する。
-- BEGIN … ROLLBACK のため永続変更は残らない（検証専用）。
-- 本番適用には stage3_asymmetric_follow_access.sql を使うこと。
-- このリポジトリからは自動実行しないこと。
--
-- 前提: Stage2 が適用済みであること。
-- 内容は stage3_asymmetric_follow_access.sql と同一で、末尾のみ ROLLBACK。
-- ------------------------------------------------------------

BEGIN;

-- ============================================================
-- 0) 前提検査
-- ============================================================
DO $$
DECLARE
  select_names text[];
  select_roles name[];
  rls_on boolean;
  follow_oid oid;
  follow_result text;
  can_view_oid oid;
  unfollow_oid oid;
  accept_oid oid;
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

  IF select_names IS DISTINCT FROM ARRAY['items_select_mutual']::text[] THEN
    RAISE EXCEPTION
      'ABORT: items SELECT ポリシーが Stage2 想定外です。found=% expected={items_select_mutual}。先に Stage2 を適用してください。',
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
      'ABORT: items_select_mutual の roles が想定外です。roles=% expected={public}',
      select_roles;
  END IF;

  SELECT p.oid, pg_get_function_result(p.oid)
  INTO follow_oid, follow_result
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
      'ABORT: follow_shelf の戻り値が public.follows ではありません。found=%',
      follow_result;
  END IF;

  SELECT p.oid INTO can_view_oid
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'can_view_user_items'
    AND pg_get_function_identity_arguments(p.oid) = 'owner_id uuid';

  IF can_view_oid IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.can_view_user_items(owner_id uuid) が見つかりません。';
  END IF;

  SELECT p.oid INTO unfollow_oid
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'unfollow_shelf'
    AND pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid';

  IF unfollow_oid IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.unfollow_shelf(target_user_id uuid) が見つかりません。';
  END IF;

  SELECT p.oid INTO accept_oid
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'accept_follow_request'
    AND pg_get_function_identity_arguments(p.oid) = 'request_id uuid';

  IF accept_oid IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.accept_follow_request(request_id uuid) が見つかりません。';
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
      'ABORT: follows_follower_id_following_id_key が見つかりません。';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.follows', 'SELECT') THEN
    RAISE EXCEPTION
      'ABORT: authenticated に public.follows の SELECT がありません。';
  END IF;
END $$;

-- Stage2 と同様、直接 UPDATE/DELETE 禁止を再確認
REVOKE UPDATE, DELETE ON TABLE public.follows FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.follows FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.follows FROM PUBLIC;

-- ============================================================
-- 1) 閲覧判定（Stage3）
--    - 所有者 / 公開棚 → 可
--    - 非公開棚: 本登録かつ accepted(V→O)
--      - 閲覧者も非公開のときだけ、さらに accepted(O→V) が必要
--    - 公開棚へのフォロー（O→V のみ等）では非公開閲覧不可
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
            AND f.follower_id = auth.uid()
            AND f.following_id = owner_id
        )
        AND (
          -- 閲覧者が公開なら outgoing accepted のみで非公開棚を閲覧可
          EXISTS (
            SELECT 1
            FROM public.profiles AS v
            WHERE v.id = auth.uid()
              AND v.is_public IS TRUE
          )
          -- 両者非公開なら両方向 accepted が必要
          OR EXISTS (
            SELECT 1
            FROM public.follows AS r
            WHERE r.status = 'accepted'
              AND r.follower_id = owner_id
              AND r.following_id = auth.uid()
          )
        )
      THEN true
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.can_view_user_items(uuid) IS
  'items SELECT 用: 所有者 / 公開棚 / 本登録かつ向き付き承認フォロー（非公開同士は双方向）';

REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_view_user_items(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_user_items(uuid) TO PUBLIC;
ALTER FUNCTION public.can_view_user_items(uuid) OWNER TO postgres;

-- items SELECT ポリシーは Stage2 の items_select_mutual を維持
-- （USING は can_view_user_items 呼び出しのため定義差し替え不要）

-- ============================================================
-- 2) 非公開同士の既存 accepted を相互化（INSERT / pending→accepted のみ。削除なし）
-- ============================================================
-- 片方向 pending の逆向きを accepted に上げる
UPDATE public.follows AS reverse_row
SET status = 'accepted'
FROM public.follows AS forward_row
JOIN public.profiles AS p_follower
  ON p_follower.id = forward_row.follower_id
JOIN public.profiles AS p_following
  ON p_following.id = forward_row.following_id
WHERE reverse_row.follower_id = forward_row.following_id
  AND reverse_row.following_id = forward_row.follower_id
  AND forward_row.status = 'accepted'
  AND reverse_row.status = 'pending'
  AND p_follower.is_public IS NOT TRUE
  AND p_following.is_public IS NOT TRUE;

-- 逆向き行が無い場合は accepted を新規作成
INSERT INTO public.follows (follower_id, following_id, status)
SELECT
  forward_row.following_id,
  forward_row.follower_id,
  'accepted'
FROM public.follows AS forward_row
JOIN public.profiles AS p_follower
  ON p_follower.id = forward_row.follower_id
JOIN public.profiles AS p_following
  ON p_following.id = forward_row.following_id
WHERE forward_row.status = 'accepted'
  AND p_follower.is_public IS NOT TRUE
  AND p_following.is_public IS NOT TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.follows AS reverse_row
    WHERE reverse_row.follower_id = forward_row.following_id
      AND reverse_row.following_id = forward_row.follower_id
  );

-- ============================================================
-- 3) unfollow_shelf
--    対象: me → target
--    両者非公開: 双方向 DELETE / それ以外: outgoing のみ
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
  me_is_public boolean;
  target_is_public boolean;
  both_private boolean;
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

  SELECT p.is_public
  INTO me_is_public
  FROM public.profiles AS p
  WHERE p.id = me
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'viewer profile not found';
  END IF;

  SELECT p.is_public
  INTO target_is_public
  FROM public.profiles AS p
  WHERE p.id = target_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found';
  END IF;

  both_private :=
    (me_is_public IS NOT TRUE)
    AND (target_is_public IS NOT TRUE);

  IF both_private THEN
    DELETE FROM public.follows
    WHERE (follower_id = me AND following_id = target_user_id)
       OR (follower_id = target_user_id AND following_id = me);
  ELSE
    DELETE FROM public.follows
    WHERE follower_id = me
      AND following_id = target_user_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.unfollow_shelf(uuid) IS
  'フォロー解除。自分→相手。両者非公開なら双方向削除。公開を含む場合は outgoing のみ。ペアロック。';

REVOKE ALL ON FUNCTION public.unfollow_shelf(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unfollow_shelf(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.unfollow_shelf(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_shelf(uuid) TO authenticated;
ALTER FUNCTION public.unfollow_shelf(uuid) OWNER TO postgres;

-- ============================================================
-- 4) remove_follower（新規）
--    対象: follower → me
--    両者非公開: 双方向 DELETE / それ以外: incoming のみ
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_follower(follower_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  anon_claim text;
  me_is_public boolean;
  follower_is_public boolean;
  both_private boolean;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  anon_claim := auth.jwt() ->> 'is_anonymous';
  IF anon_claim IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'only permanent users can remove followers'
      USING ERRCODE = '42501';
  END IF;

  IF follower_user_id IS NULL OR follower_user_id = me THEN
    RAISE EXCEPTION 'invalid follower_user_id';
  END IF;

  PERFORM public.myshelf_follow_pair_lock(me, follower_user_id);

  SELECT p.is_public
  INTO me_is_public
  FROM public.profiles AS p
  WHERE p.id = me
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner profile not found';
  END IF;

  SELECT p.is_public
  INTO follower_is_public
  FROM public.profiles AS p
  WHERE p.id = follower_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'follower profile not found';
  END IF;

  both_private :=
    (me_is_public IS NOT TRUE)
    AND (follower_is_public IS NOT TRUE);

  IF both_private THEN
    DELETE FROM public.follows
    WHERE (follower_id = me AND following_id = follower_user_id)
       OR (follower_id = follower_user_id AND following_id = me);
  ELSE
    DELETE FROM public.follows
    WHERE follower_id = follower_user_id
      AND following_id = me;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.remove_follower(uuid) IS
  'フォロワー解除。相手→自分。両者非公開なら双方向削除。公開を含む場合は incoming のみ。ペアロック。';

REVOKE ALL ON FUNCTION public.remove_follower(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_follower(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.remove_follower(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.remove_follower(uuid) TO authenticated;
ALTER FUNCTION public.remove_follower(uuid) OWNER TO postgres;

-- ============================================================
-- 5) accept_follow_request
--    pending→accepted のあと、両者非公開なら逆向き accepted を成立
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
  me_is_public boolean;
  follower_is_public boolean;
  reverse_row public.follows%ROWTYPE;
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
    -- 既承認でも非公開同士の逆向き不足を補完する
    NULL;
  ELSIF req.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'follow request is not pending (status=%)', req.status;
  ELSE
    UPDATE public.follows
    SET status = 'accepted'
    WHERE id = request_id
      AND following_id = me
      AND status = 'pending';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'accept failed: request was concurrently modified';
    END IF;
  END IF;

  SELECT p.is_public
  INTO me_is_public
  FROM public.profiles AS p
  WHERE p.id = me
  FOR SHARE;

  SELECT p.is_public
  INTO follower_is_public
  FROM public.profiles AS p
  WHERE p.id = req.follower_id
  FOR SHARE;

  -- 両者非公開: 逆向き accepted を成立（公開棚フォローだけでは作らない）
  IF me_is_public IS NOT TRUE
     AND follower_is_public IS NOT TRUE THEN
    SELECT f.*
    INTO reverse_row
    FROM public.follows AS f
    WHERE f.follower_id = me
      AND f.following_id = req.follower_id
    FOR UPDATE;

    IF NOT FOUND THEN
      BEGIN
        INSERT INTO public.follows (follower_id, following_id, status)
        VALUES (me, req.follower_id, 'accepted');
      EXCEPTION
        WHEN unique_violation THEN
          UPDATE public.follows
          SET status = 'accepted'
          WHERE follower_id = me
            AND following_id = req.follower_id
            AND status = 'pending';
      END;
    ELSIF reverse_row.status = 'pending' THEN
      UPDATE public.follows
      SET status = 'accepted'
      WHERE id = reverse_row.id
        AND status = 'pending';
    END IF;
  END IF;

  RETURN 'accepted';
END;
$$;

COMMENT ON FUNCTION public.accept_follow_request(uuid) IS
  'pending 承認。ペアロック。両者非公開なら逆向き accepted も成立。';

REVOKE ALL ON FUNCTION public.accept_follow_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_follow_request(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.accept_follow_request(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_follow_request(uuid) TO authenticated;
ALTER FUNCTION public.accept_follow_request(uuid) OWNER TO postgres;

-- reject_follow_request は Stage2 のまま（pending 行のみ削除）で足りるが、
-- 権限再確認のため OWNER / REVOKE を揃える（定義は変更しない）

-- ============================================================
-- 6) follow_shelf
--    逆向き accepted だけでは「フォロー済み」とみなさない
--    （公開AをBがフォローしても A→B は別申請）
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

  -- 自分→相手の既存行があれば UPDATE せず返す
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
  '棚フォロー申請。公開=accepted / 非公開=pending。自分→相手のみ。RETURNS public.follows。';

REVOKE ALL ON FUNCTION public.follow_shelf(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.follow_shelf(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.follow_shelf(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.follow_shelf(uuid) TO authenticated;
ALTER FUNCTION public.follow_shelf(uuid) OWNER TO postgres;

-- ============================================================
-- 7) 最終検証
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
        'remove_follower',
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

  IF has_function_privilege('anon', 'public.follow_shelf(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.unfollow_shelf(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.remove_follower(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_follow_request(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reject_follow_request(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION
      'ABORT: anon が follow 系 RPC を実行できます。';
  END IF;

  IF NOT (
    has_function_privilege('authenticated', 'public.follow_shelf(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.unfollow_shelf(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.remove_follower(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.accept_follow_request(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.reject_follow_request(uuid)', 'EXECUTE')
  ) THEN
    RAISE EXCEPTION
      'ABORT: authenticated に follow 系 RPC の EXECUTE がありません。';
  END IF;

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
        'remove_follower',
        'accept_follow_request',
        'reject_follow_request'
      )
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION
      'ABORT: follow 系 RPC の ACL に PUBLIC EXECUTE が残っています。';
  END IF;

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
        'remove_follower',
        'accept_follow_request',
        'reject_follow_request'
      )
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee = r.oid
  ) THEN
    RAISE EXCEPTION
      'ABORT: follow 系 RPC の ACL に anon への直接 EXECUTE が残っています。';
  END IF;

  IF NOT has_function_privilege('anon', 'public.can_view_user_items(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'ABORT: anon が can_view_user_items を実行できません。';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.follows', 'SELECT') THEN
    RAISE EXCEPTION
      'ABORT: authenticated の follows SELECT が失われました。';
  END IF;

  IF has_table_privilege('authenticated', 'public.follows', 'UPDATE') THEN
    RAISE EXCEPTION
      'ABORT: authenticated が public.follows を直接 UPDATE できます。';
  END IF;

  IF has_table_privilege('authenticated', 'public.follows', 'DELETE') THEN
    RAISE EXCEPTION
      'ABORT: authenticated が public.follows を直接 DELETE できます。';
  END IF;

  IF has_table_privilege('anon', 'public.follows', 'UPDATE')
     OR has_table_privilege('anon', 'public.follows', 'DELETE') THEN
    RAISE EXCEPTION
      'ABORT: anon が public.follows を直接 UPDATE/DELETE できます。';
  END IF;
END $$;

-- ドライラン: 変更を破棄
ROLLBACK;
