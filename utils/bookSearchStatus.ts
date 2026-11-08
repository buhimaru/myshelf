/** 本検索の成否を、正常0件と通信障害で取り違えないための判定 */

export const BOOK_SEARCH_UNAVAILABLE_MESSAGE =
  "検索できませんでした。時間をおいて再試行してください";

export type BookSearchOutcome =
  | { kind: "results"; source: "ndl" | "openlibrary" }
  | { kind: "empty" } // 正常に検索でき、該当なし
  | { kind: "unavailable"; message: string }; // 一時障害など

export function classifyBookSearchOutcome(input: {
  ndlSucceeded: boolean;
  ndlTransportFailed: boolean;
  olSucceeded: boolean;
  olTransportFailed: boolean;
  resultCount: number;
}): BookSearchOutcome {
  if (input.resultCount > 0) {
    return {
      kind: "results",
      source: input.ndlSucceeded ? "ndl" : "openlibrary",
    };
  }

  // どちらかの輸送経路が失敗し、結果が空 → 見つからないではなく障害
  if (input.ndlTransportFailed || input.olTransportFailed) {
    return {
      kind: "unavailable",
      message: BOOK_SEARCH_UNAVAILABLE_MESSAGE,
    };
  }

  // 両方とも成功したが0件
  if (input.ndlSucceeded || input.olSucceeded) {
    return { kind: "empty" };
  }

  return {
    kind: "unavailable",
    message: BOOK_SEARCH_UNAVAILABLE_MESSAGE,
  };
}

export function isRetryableBookSearchError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    if (/timeout|timed out|network|fetch failed/i.test(error.message)) {
      return true;
    }
    if (/NDL検索に失敗しました:\s*(429|5\d\d)/.test(error.message)) {
      return true;
    }
    if (/Open Libraryの検索に失敗しました:\s*(429|5\d\d)/.test(error.message)) {
      return true;
    }
    if (/NDL応答がXMLではありません|NDL応答の解析に失敗/.test(error.message)) {
      return true;
    }
  }
  return false;
}
