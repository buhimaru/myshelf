/**
 * 複数作品削除の結果集計（UI / DB から切り離した純粋ロジック）。
 * 返ってきた削除済み ID 以外は失敗扱いとし、ローカルからも落とさない。
 */
export function summarizeBulkDelete(
  requestedIds: readonly string[],
  deletedIds: readonly string[]
): { succeededIds: string[]; failedIds: string[] } {
  const deleted = new Set(deletedIds);
  const succeededIds: string[] = [];
  const failedIds: string[] = [];
  for (const id of requestedIds) {
    if (deleted.has(id)) succeededIds.push(id);
    else failedIds.push(id);
  }
  return { succeededIds, failedIds };
}

export function formatBulkDeleteMessage(
  succeededCount: number,
  failedCount: number
): string {
  if (failedCount <= 0) {
    return `${succeededCount}件の作品を削除しました。`;
  }
  if (succeededCount <= 0) {
    return `削除に失敗しました（${failedCount}件）。`;
  }
  return `${succeededCount}件を削除しました。${failedCount}件は削除できませんでした。`;
}
