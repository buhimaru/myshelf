-- myshelf: X広告など UTM 経由のファネル計測（ローカル／本番適用は別途承認）
-- 既存 tables（profiles / items / follows）は変更しない。
--
-- 適用順序（Supabase SQL Editor）:
--   1) 本ファイル ad_funnel_events.sql を実行
--   2) 任意: ad_funnel_verify.sql で権限・制約を確認
--   3) 集計は ad_funnel_aggregate.sql
--   4) 保持期限超過の削除は ad_funnel_cleanup.sql（手動）
-- 本番適用は承認後のみ。

create table if not exists public.ad_funnel_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  event_name text not null,
  utm_source text not null,
  utm_medium text not null,
  utm_campaign text not null,
  auth_user_id uuid null,
  created_at timestamptz not null default now(),
  constraint ad_funnel_events_event_name_chk
    check (event_name in ('visit', 'guest_start', 'first_item', 'registered')),
  constraint ad_funnel_events_utm_source_chk
    check (char_length(utm_source) between 1 and 64),
  constraint ad_funnel_events_utm_medium_chk
    check (char_length(utm_medium) between 1 and 64),
  constraint ad_funnel_events_utm_campaign_chk
    check (char_length(utm_campaign) between 1 and 64)
);

comment on table public.ad_funnel_events is
  '広告ファネル計測。メール等の直接個人情報は保存しない。';

create index if not exists ad_funnel_events_campaign_event_created_idx
  on public.ad_funnel_events (utm_campaign, event_name, created_at);

create index if not exists ad_funnel_events_visitor_event_idx
  on public.ad_funnel_events (visitor_id, event_name);

-- コンバージョンは visitor 単位で1回
create unique index if not exists ad_funnel_events_visitor_conversion_uidx
  on public.ad_funnel_events (visitor_id, event_name)
  where event_name in ('guest_start', 'first_item', 'registered');

-- 同一 auth ユーザーのコンバージョンも1回（端末またぎの重複緩和）
create unique index if not exists ad_funnel_events_user_conversion_uidx
  on public.ad_funnel_events (auth_user_id, event_name)
  where auth_user_id is not null
    and event_name in ('guest_start', 'first_item', 'registered');

alter table public.ad_funnel_events enable row level security;

-- 一般ロールからの直接 select / update / delete / insert は不可
revoke all on table public.ad_funnel_events from anon, authenticated;
grant select, insert on table public.ad_funnel_events to service_role;

-- 記録用 RPC（サーバー／クライアントから publishable key + 任意 JWT で呼ぶ）
create or replace function public.record_ad_funnel_event(
  p_visitor_id uuid,
  p_event_name text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_anonymous text;
  v_item_count integer;
  v_source text := lower(trim(p_utm_source));
  v_medium text := lower(trim(p_utm_medium));
  v_campaign text := lower(trim(p_utm_campaign));
  v_event text := lower(trim(p_event_name));
begin
  if p_visitor_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_visitor');
  end if;

  if v_event not in ('visit', 'guest_start', 'first_item', 'registered') then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;

  if v_source is null or v_medium is null or v_campaign is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_utm');
  end if;

  if v_source !~ '^[a-z0-9_]{1,64}$'
     or v_medium !~ '^[a-z0-9_]{1,64}$'
     or v_campaign !~ '^[a-z0-9_]{1,64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_utm_format');
  end if;

  -- コンバージョンは「同一 visitor + 同一 UTM の visit」が先行していること
  -- （未認証者がいきなり conversion を作れない／別キャンペーンへの便乗を抑止）
  if v_event in ('guest_start', 'first_item', 'registered') then
    if not exists (
      select 1
      from public.ad_funnel_events e
      where e.visitor_id = p_visitor_id
        and e.event_name = 'visit'
        and e.utm_source = v_source
        and e.utm_medium = v_medium
        and e.utm_campaign = v_campaign
    ) then
      return jsonb_build_object('ok', false, 'error', 'missing_visit');
    end if;
  end if;

  if v_event = 'guest_start' then
    if v_uid is null then
      return jsonb_build_object('ok', false, 'error', 'auth_required');
    end if;
    v_is_anonymous := coalesce(auth.jwt() ->> 'is_anonymous', 'false');
    if v_is_anonymous is distinct from 'true' then
      return jsonb_build_object('ok', false, 'error', 'not_anonymous');
    end if;
  elsif v_event = 'first_item' then
    if v_uid is null then
      return jsonb_build_object('ok', false, 'error', 'auth_required');
    end if;
    -- クライアント申告を信用せず、JWT の本人 (auth.uid) の items だけを数える
    -- auth_user_id はパラメータで受け取らず、常に v_uid のみを保存する
    select count(*)::integer into v_item_count
    from public.items
    where user_id = v_uid;
    if coalesce(v_item_count, 0) <> 1 then
      return jsonb_build_object('ok', false, 'error', 'not_first_item');
    end if;
  elsif v_event = 'registered' then
    if v_uid is null then
      return jsonb_build_object('ok', false, 'error', 'auth_required');
    end if;
    v_is_anonymous := coalesce(auth.jwt() ->> 'is_anonymous', 'true');
    if v_is_anonymous is distinct from 'false' then
      return jsonb_build_object('ok', false, 'error', 'not_registered');
    end if;
  end if;

  begin
    insert into public.ad_funnel_events (
      visitor_id,
      event_name,
      utm_source,
      utm_medium,
      utm_campaign,
      auth_user_id
    ) values (
      p_visitor_id,
      v_event,
      v_source,
      v_medium,
      v_campaign,
      -- 他人の user id をクライアントから指定する経路はない
      case when v_event = 'visit' then null else v_uid end
    );
  exception
    when unique_violation then
      return jsonb_build_object('ok', true, 'deduped', true);
  end;

  return jsonb_build_object('ok', true, 'deduped', false);
end;
$$;

revoke all on function public.record_ad_funnel_event(uuid, text, text, text, text)
  from public;
grant execute on function public.record_ad_funnel_event(uuid, text, text, text, text)
  to anon, authenticated, service_role;
