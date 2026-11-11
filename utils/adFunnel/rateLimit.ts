type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

/**
 * プロセス内の簡易レート制限（実験用途）。超過なら false。
 * Vercel のサーバーレスではインスタンスごとに独立するため、
 * 厳密な全体上限にはならない。初回少額広告では、
 * コンバージョンの DB UNIQUE + visit 必須制約で実害を抑える前提。
 */
export function allowAdFunnelRequest(key: string): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_PER_WINDOW) {
    return false;
  }
  current.count += 1;
  return true;
}
