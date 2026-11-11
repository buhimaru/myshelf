-- myshelf: ad_funnel 適用後の動作・権限確認（読み取り中心）

-- 1) テーブル / RPC の存在
select
  to_regclass('public.ad_funnel_events') as table_regclass,
  to_regprocedure(
    'public.record_ad_funnel_event(uuid,text,text,text,text)'
  ) as rpc_regprocedure;

-- 2) RLS 有効
select c.relname, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'ad_funnel_events';

-- 3) anon / authenticated にテーブル直接権限が無いこと
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'ad_funnel_events'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

-- 4) RPC 実行権限
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'record_ad_funnel_event'
order by grantee, privilege_type;

-- 5) 未認証 visit のスモーク（SQL Editor は通常 privileged。API 経由確認を推奨）
-- アプリ側確認手順:
--   a. シークレットウィンドウで
--      /?lp=1&utm_source=x&utm_medium=paid&utm_campaign=launch_3000
--   b. ad_funnel_events に event_name=visit が1件増える
--   c. Authorization なしで first_item / registered を POST すると失敗すること
--   d. はじめる → 匿名利用 → guest_start
--   e. 初作品追加 → first_item（既存作品があるアカウントでは入らない）
--   f. 正式登録完了 → registered（同一 visitor で1回）
