/**
 * 複数削除の結果集計ロジックのモック検証（実DBは叩かない）。
 */
import {
  formatBulkDeleteMessage,
  summarizeBulkDelete,
} from "../utils/bulkDeleteItems.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  const r = summarizeBulkDelete(["a", "b", "c"], ["a", "c"]);
  assert(r.succeededIds.join(",") === "a,c", "partial success ids");
  assert(r.failedIds.join(",") === "b", "partial fail ids");
  assert(
    formatBulkDeleteMessage(2, 1) ===
      "2件を削除しました。1件は削除できませんでした。",
    "partial message"
  );
}

{
  const r = summarizeBulkDelete(["x", "y"], ["x", "y"]);
  assert(r.failedIds.length === 0, "full success failed empty");
  assert(
    formatBulkDeleteMessage(2, 0) === "2件の作品を削除しました。",
    "full success message"
  );
}

{
  const r = summarizeBulkDelete(["z"], []);
  assert(r.succeededIds.length === 0, "full fail succeeded empty");
  assert(
    formatBulkDeleteMessage(0, 1) === "削除に失敗しました（1件）。",
    "full fail message"
  );
}

console.log("verify-bulk-delete-summary: ok");
