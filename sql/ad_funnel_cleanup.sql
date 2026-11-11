-- myshelf: 広告計測イベントの保持期限クリーンアップ（手動実行）
--
-- 方針:
--   - ブラウザ側 attribution（localStorage）: 約30日（アプリが期限切れを削除）
--   - DB イベント: 効果確認用に長めに残し、不要分を手動削除
-- 既定: 作成から 90 日超を削除（必要なら間隔を変更）
--
-- 実行前に件数を確認してから DELETE すること。

-- 削除対象の確認
select
  event_name,
  count(*) as rows_to_delete,
  min(created_at) as oldest,
  max(created_at) as newest
from public.ad_funnel_events
where created_at < now() - interval '90 days'
group by event_name
order by event_name;

-- 本番で削除する場合のみコメント解除
-- delete from public.ad_funnel_events
-- where created_at < now() - interval '90 days';
