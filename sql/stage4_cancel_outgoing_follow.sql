-- myshelf Stage4: 自分が送った pending フォロー申請の取り消し
-- ------------------------------------------------------------
-- 適用方法: Supabase SQL Editor でこのファイルを手動実行する。
-- このリポジトリからは自動実行しないこと。
--
-- なぜ必要か:
--   unfollow_shelf は両者非公開のとき双方向 DELETE するため、
--   「申請取り消し」専用には使えない（逆向きの accepted を消し得る）。
--   reject_follow_request は棚所有者（incoming）専用。
--
-- この RPC:
--   - follower_id = auth.uid() かつ status = pending の行だけ削除
--   - ペアロック / fail-closed / SECURITY DEFINER
--   - 既存 follows / items の一括削除はしない
-- ------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_follow_request(target_user_id uuid)
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
    RAISE EXCEPTION 'only permanent users can cancel follow requests'
      USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL OR target_user_id = me THEN
    RAISE EXCEPTION 'invalid target_user_id';
  END IF;

  PERFORM public.myshelf_follow_pair_lock(me, target_user_id);

  SELECT f.*
  INTO req
  FROM public.follows AS f
  WHERE f.follower_id = me
    AND f.following_id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF req.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'follow request is not pending (status=%)', req.status;
  END IF;

  DELETE FROM public.follows
  WHERE id = req.id
    AND follower_id = me
    AND following_id = target_user_id
    AND status = 'pending';
END;
$$;

COMMENT ON FUNCTION public.cancel_follow_request(uuid) IS
  '自分が送った pending フォロー申請の取り消し。outgoing pending 行のみ削除。';

REVOKE ALL ON FUNCTION public.cancel_follow_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_follow_request(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_follow_request(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_follow_request(uuid) TO authenticated;
ALTER FUNCTION public.cancel_follow_request(uuid) OWNER TO postgres;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.cancel_follow_request(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: anon が cancel_follow_request を実行できます。';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.cancel_follow_request(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ABORT: authenticated に cancel_follow_request の EXECUTE がありません。';
  END IF;

  IF pg_get_userbyid(
    (SELECT p.proowner
     FROM pg_proc AS p
     JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'cancel_follow_request'
       AND pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid')
  ) IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'ABORT: cancel_follow_request の OWNER が postgres ではありません。';
  END IF;
END $$;

COMMIT;
