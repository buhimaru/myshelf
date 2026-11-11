-- myshelf: 広告ファネル集計（Supabase SQL Editor で実行）
-- 既定キャンペーン: launch_3000 / 広告費: 3000円
--
-- 訪問数 = visit 行数（同一 visitor の再訪・再クリックで増える）
-- ユニーク訪問者数 = visit の distinct visitor_id
-- X広告管理画面のクリック数と visit は一致しない場合がある（離脱・ボット・計測遅延など）
--
-- 必要に応じて campaign / ad_spend_yen を書き換えて実行

-- ========== サマリー ==========
with params as (
  select
    'launch_3000'::text as campaign,
    3000::numeric as ad_spend_yen
),
base as (
  select e.*
  from public.ad_funnel_events e
  cross join params p
  where e.utm_campaign = p.campaign
    and e.utm_source = 'x'
    and e.utm_medium = 'paid'
),
counts as (
  select
    (select count(*) from base where event_name = 'visit') as visits,
    (select count(distinct visitor_id) from base where event_name = 'visit') as unique_visitors,
    (select count(*) from base where event_name = 'guest_start') as guest_starts,
    (select count(*) from base where event_name = 'first_item') as first_items,
    (select count(*) from base where event_name = 'registered') as registered
)
select
  c.visits as "1_広告経由訪問数",
  c.unique_visitors as "2_ユニーク訪問者数",
  c.guest_starts as "3_匿名利用開始人数",
  c.first_items as "4_初作品追加人数",
  c.registered as "5_正式登録完了人数",
  round(
    case when c.unique_visitors > 0
      then c.guest_starts::numeric / c.unique_visitors * 100
      else 0 end
  , 2) as "転換率_訪問to匿名_%",
  round(
    case when c.guest_starts > 0
      then c.first_items::numeric / c.guest_starts * 100
      else 0 end
  , 2) as "転換率_匿名to初作品_%",
  round(
    case when c.first_items > 0
      then c.registered::numeric / c.first_items * 100
      else 0 end
  , 2) as "転換率_初作品to正式_%",
  round(
    case when c.unique_visitors > 0
      then c.first_items::numeric / c.unique_visitors * 100
      else 0 end
  , 2) as "転換率_訪問to初作品_%",
  case when c.first_items > 0
    then round((select ad_spend_yen from params) / c.first_items, 1)
    else null end as "初作品1人あたり円",
  case when c.registered > 0
    then round((select ad_spend_yen from params) / c.registered, 1)
    else null end as "正式登録1人あたり円",
  case when c.guest_starts > 0
    then round((select ad_spend_yen from params) / c.guest_starts, 1)
    else null end as "匿名開始1人あたり円"
from counts c;

-- ========== 日別（任意） ==========
-- select
--   date_trunc('day', created_at) as day,
--   event_name,
--   count(*) as events,
--   count(distinct visitor_id) as unique_visitors
-- from public.ad_funnel_events
-- where utm_campaign = 'launch_3000'
-- group by 1, 2
-- order by 1 desc, 2;
