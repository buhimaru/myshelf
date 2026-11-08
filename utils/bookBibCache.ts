/**
 * 本の書誌検索向け・プロセス内短期キャッシュ。
 * 成功した書誌結果のみ長めに保持。障害レスポンスは入れない。
 */

export type CachedBibResponse = {
  status: number;
  body: Record<string, unknown>;
};

type CacheEntry = {
  expiresAt: number;
  value: CachedBibResponse;
};

const HIT_TTL_MS = 120_000;
const EMPTY_TTL_MS = 20_000;
const MAX_ENTRIES = 80;

const resultCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CachedBibResponse>>();

/** 表記揺れを抑えたキャッシュキー（個人情報は含めない） */
export function normalizeBookQueryKey(raw: string): string {
  return (raw || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[【】〔〕［\]\[\]()（）「」『』"'「」]/g, " ")
    .replace(/[\u30FB\uFF65\u00B7\u2022\u2219]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pruneExpired(now: number) {
  for (const [key, entry] of resultCache) {
    if (entry.expiresAt <= now) resultCache.delete(key);
  }
}

function enforceCapacity() {
  while (resultCache.size > MAX_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    if (oldest === undefined) break;
    resultCache.delete(oldest);
  }
}

export function getCachedBibResponse(queryKey: string): CachedBibResponse | null {
  const now = Date.now();
  pruneExpired(now);
  const entry = resultCache.get(queryKey);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    resultCache.delete(queryKey);
    return null;
  }
  // LRU風に末尾へ
  resultCache.delete(queryKey);
  resultCache.set(queryKey, entry);
  return entry.value;
}

/**
 * キャッシュ可能か。
 * - 503/4xx や error 付きは不可
 * - 結果ありは HIT_TTL
 * - 正常0件は短 TTL（誤った「なし」の長期固定を避ける）
 */
export function cacheBibResponse(
  queryKey: string,
  value: CachedBibResponse
): void {
  if (!queryKey) return;
  if (value.status !== 200) return;
  if (typeof value.body.error === "string" && value.body.error.trim()) return;

  const results = value.body.results;
  const isArray = Array.isArray(results);
  if (!isArray) return;

  const ttl = results.length > 0 ? HIT_TTL_MS : EMPTY_TTL_MS;
  const now = Date.now();
  pruneExpired(now);
  resultCache.set(queryKey, { expiresAt: now + ttl, value });
  enforceCapacity();
}

export function getInflightBib(
  queryKey: string
): Promise<CachedBibResponse> | null {
  return inflight.get(queryKey) ?? null;
}

export function setInflightBib(
  queryKey: string,
  promise: Promise<CachedBibResponse>
): void {
  inflight.set(queryKey, promise);
  const clear = () => {
    if (inflight.get(queryKey) === promise) inflight.delete(queryKey);
  };
  promise.then(clear, clear);
}

/** テスト用 */
export function clearBookBibCacheForTests(): void {
  resultCache.clear();
  inflight.clear();
}

export function bookBibCacheStatsForTests(): {
  size: number;
  inflight: number;
} {
  return { size: resultCache.size, inflight: inflight.size };
}
