/**
 * 本の表紙補完用・楽天ブックス書籍検索（ISBN 厳密一致）。
 * Open Library 失敗後のフォールバック専用。429 時は再試行しない。
 * 漫画検索（BooksTotal）と同じ App ID / Access Key / Origin を流用。
 */

const RAKUTEN_BOOKS_BOOK_SEARCH_URL =
  "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";
const RAKUTEN_REQUEST_ORIGIN = "https://myshelf-gamma.vercel.app";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 120_000;
const CACHE_MAX = 80;

type RakutenBookItem = {
  title?: string;
  author?: string;
  isbn?: string;
  largeImageUrl?: string;
  mediumImageUrl?: string;
  smallImageUrl?: string;
};

type CacheEntry = {
  expiresAt: number;
  url: string | null;
};

const isbnCoverCache = new Map<string, CacheEntry>();
const isbnInflight = new Map<string, Promise<string | null>>();

const REJECT_TITLE_RE =
  /漫画|コミック|劇画|マンガ|manga|comic|アンソロジー|選集|全集|映画|ドラマ|シナリオ/i;

function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, "").toUpperCase();
}

function normalizeAuthor(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[,\s　、・．.。]/g, "")
    .replace(/\d{4}-?/g, "")
    .replace(/(?:著|作|訳|編|監修)$/u, "")
    .toLowerCase()
    .trim();
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[【】〔〕［\]\[\]()（）「」『』"'「」]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 巻号・上下・数字接尾を除いて作品核を取り出す */
function stripEditionNoise(title: string): string {
  let current = title.normalize("NFKC").trim();
  current = current.replace(
    /[\s　]*[（(]?\s*(?:上|中|下|前|後|続|完)\s*[)）]?\s*$/u,
    ""
  );
  current = current.replace(/[\s　]*[第]?\s*[0-9０-９一二三四五六七八九十]+\s*(?:巻|冊|部|編)?\s*$/u, "");
  current = current.replace(/[\s　]+[0-9０-９]{1,2}\s*$/u, "");
  return current.trim();
}

function authorsMatch(workAuthor: string, productAuthor: string): boolean {
  const a = normalizeAuthor(workAuthor);
  const b = normalizeAuthor(productAuthor);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * 作品題名と楽天商品題名が同一作品か。
 * 上下巻・巻号だけの差は許容。別作品・漫画化は拒否。
 */
function titlesCompatible(workTitle: string, productTitle: string): boolean {
  if (REJECT_TITLE_RE.test(productTitle)) return false;
  const w = normalizeTitle(stripEditionNoise(workTitle));
  const p = normalizeTitle(stripEditionNoise(productTitle));
  if (!w || !p) return false;
  if (w === p) return true;
  // 商品側が作品名＋短い巻記号のみ
  if (p.startsWith(w) && p.length - w.length <= 6) return true;
  if (w.startsWith(p) && w.length - p.length <= 2) return true;
  return false;
}

function pickImageUrl(item: RakutenBookItem): string {
  return (
    item.largeImageUrl ||
    item.mediumImageUrl ||
    item.smallImageUrl ||
    ""
  ).trim();
}

function readCache(isbn: string): string | null | undefined {
  const entry = isbnCoverCache.get(isbn);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    isbnCoverCache.delete(isbn);
    return undefined;
  }
  return entry.url;
}

function writeCache(isbn: string, url: string | null): void {
  isbnCoverCache.set(isbn, { expiresAt: Date.now() + CACHE_TTL_MS, url });
  while (isbnCoverCache.size > CACHE_MAX) {
    const oldest = isbnCoverCache.keys().next().value;
    if (oldest === undefined) break;
    isbnCoverCache.delete(oldest);
  }
}

async function fetchRakutenByIsbn(isbn: string): Promise<RakutenBookItem | null> {
  const applicationId = process.env.RAKUTEN_APPLICATION_ID?.trim();
  const accessKey = process.env.RAKUTEN_ACCESS_KEY?.trim();
  if (!applicationId || !accessKey) return null;

  const url = new URL(RAKUTEN_BOOKS_BOOK_SEARCH_URL);
  url.searchParams.set("applicationId", applicationId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("isbn", isbn);
  url.searchParams.set("hits", "1");
  url.searchParams.set("outOfStockFlag", "1");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Origin: RAKUTEN_REQUEST_ORIGIN,
      },
    });
    if (response.status === 429) {
      console.error("楽天表紙補完: 429");
      return null;
    }
    if (!response.ok) return null;
    const data = (await response.json()) as { Items?: RakutenBookItem[] };
    const item = Array.isArray(data.Items) ? data.Items[0] : null;
    return item ?? null;
  } catch (error) {
    console.error("楽天表紙補完エラー:", error instanceof Error ? error.name : "Error");
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * ISBN ごとに最大1回照会。著者・題名が一致し画像があるときだけ URL を返す。
 */
export async function fetchRakutenBookCoverByIsbn(args: {
  isbn: string;
  workTitle: string;
  workAuthor: string;
}): Promise<string | null> {
  const isbn = normalizeIsbn(args.isbn);
  if (!/^\d{10}(\d{3})?$/.test(isbn) && !/^\d{9}[\dX]$/.test(isbn)) {
    return null;
  }
  if (!args.workTitle.trim() || !args.workAuthor.trim()) return null;

  const cached = readCache(isbn);
  if (cached !== undefined) return cached;

  const existing = isbnInflight.get(isbn);
  if (existing) return existing;

  const pending = (async (): Promise<string | null> => {
    const item = await fetchRakutenByIsbn(isbn);
    if (!item) {
      writeCache(isbn, null);
      return null;
    }
    const productIsbn = normalizeIsbn(String(item.isbn ?? ""));
    if (productIsbn && productIsbn !== isbn) {
      writeCache(isbn, null);
      return null;
    }
    if (!authorsMatch(args.workAuthor, String(item.author ?? ""))) {
      writeCache(isbn, null);
      return null;
    }
    if (!titlesCompatible(args.workTitle, String(item.title ?? ""))) {
      writeCache(isbn, null);
      return null;
    }
    const imageUrl = pickImageUrl(item);
    if (!imageUrl) {
      writeCache(isbn, null);
      return null;
    }
    writeCache(isbn, imageUrl);
    return imageUrl;
  })();

  isbnInflight.set(isbn, pending);
  try {
    return await pending;
  } finally {
    if (isbnInflight.get(isbn) === pending) isbnInflight.delete(isbn);
  }
}

/** OL 失敗後に試す ISBN 数（429 回避のため少なめ） */
export const RAKUTEN_COVER_ISBN_TRIES = 2;
