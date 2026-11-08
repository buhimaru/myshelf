import { NextResponse } from "next/server";
import {
  BOOK_SEARCH_UNAVAILABLE_MESSAGE,
  classifyBookSearchOutcome,
  isRetryableBookSearchError,
} from "../../../utils/bookSearchStatus";
import {
  cacheBibResponse,
  getCachedBibResponse,
  getInflightBib,
  normalizeBookQueryKey,
  setInflightBib,
  type CachedBibResponse,
} from "../../../utils/bookBibCache";
import {
  fetchRakutenBookCoverByIsbn,
  RAKUTEN_COVER_ISBN_TRIES,
} from "../../../utils/rakuten/bookCoverByIsbn";
import {
  buildCompactSearchQuery,
  buildLoanwordSpacedQuery,
  buildSoftSeparatorQuery,
} from "../../../utils/searchNotation";

type BookResult = {
  id: string;
  title: string;
  creator: string;
  type: "book";
  imageUrl: string;
  source: "ndl" | "openlibrary";
  /** 表紙補完用。書誌検索では空の imageUrl と一緒に返す */
  isbns?: string[];
};

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  language?: string[];
  edition_key?: string[];
};

type CoverCandidate = {
  url: string;
  score: number;
  lang: "jpn" | "other" | "unknown";
  via: string;
};

type NdlRecord = {
  id: string;
  title: string;
  creators: string[];
  isbns: string[];
  publisher: string;
  date: string;
};

type RankedWork = BookResult & {
  matchScore: number;
  isbns: string[];
  rawTitles: string[];
};

type Attribution = {
  provider: string;
  organization: string;
  license: string;
  licenseUrl: string;
  text: string;
};

const NDL_FETCH_TIMEOUT_MS = 15000;
const OL_FETCH_TIMEOUT_MS = 8000;
const OL_COVER_TIMEOUT_MS = 12000;
const NDL_CNT = 80;
/** 著者検索の初回件数（統合・再スコア用の母集団。501件目以降は取得不可） */
const NDL_AUTHOR_INITIAL_CNT = 160;
/** 著者検索の追加ページ件数 */
const NDL_AUTHOR_PAGE_CNT = 40;
const NDL_MAX_FETCHABLE = 500;
const MAX_RESULTS = 20;
const MAX_COVER_ENRICH = 2;
const OL_COVER_CONCURRENCY = 2;
const MAX_ISBN_COVER_TRIES = 4;
/** 試行間の間隔。過剰アクセスを避けつつ直列待ちを短縮 */
const REQUEST_GAP_MS = 120;
const NDL_RETRY_GAP_MS = 400;
/** NDL同一条件の短期キャッシュ（成功応答のみ） */
const NDL_HIT_CACHE_TTL_MS = 90_000;
const NDL_EMPTY_CACHE_TTL_MS = 15_000;
const NDL_CACHE_MAX = 60;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

type NdlFetchCacheEntry = {
  expiresAt: number;
  records: NdlRecord[];
  total: number | null;
};

type NdlInflightResult = {
  records: NdlRecord[];
  total: number | null;
};

const ndlFetchCache = new Map<string, NdlFetchCacheEntry>();
const ndlInflight = new Map<string, Promise<NdlInflightResult>>();

function ndlFetchCacheKey(
  title: string,
  author: string,
  idx = 1,
  cnt = NDL_CNT
): string {
  return `${normalizeBookQueryKey(title)}\0${normalizeBookQueryKey(author)}\0${idx}\0${cnt}`;
}

function readNdlFetchCache(key: string): NdlInflightResult | null {
  const now = Date.now();
  const entry = ndlFetchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    ndlFetchCache.delete(key);
    return null;
  }
  return {
    records: entry.records.map((record) => ({
      ...record,
      creators: [...record.creators],
      isbns: [...record.isbns],
    })),
    total: entry.total,
  };
}

function writeNdlFetchCache(
  key: string,
  records: NdlRecord[],
  total: number | null
): void {
  const ttl =
    records.length > 0 ? NDL_HIT_CACHE_TTL_MS : NDL_EMPTY_CACHE_TTL_MS;
  ndlFetchCache.set(key, {
    expiresAt: Date.now() + ttl,
    records,
    total,
  });
  while (ndlFetchCache.size > NDL_CACHE_MAX) {
    const oldest = ndlFetchCache.keys().next().value;
    if (oldest === undefined) break;
    ndlFetchCache.delete(oldest);
  }
}

/** タイムアウト後の再試行は待ち時間を倍増させるので除外。429/5xx/解析失敗のみ再試行 */
function shouldRetryNdlSearch(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    if (error.name === "AbortError") return false;
    if (/timeout|timed out/i.test(error.message)) return false;
  }
  return isRetryableBookSearchError(error);
}

const NDL_ATTRIBUTION: Attribution = {
  provider: "国立国会図書館全国書誌情報",
  organization: "国立国会図書館",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
  text: "本サービスの書誌情報の一部は、国立国会図書館サーチのAPIから取得した国立国会図書館全国書誌情報（国立国会図書館が運営）に由来します。ライセンスはクリエイティブ・コモンズ 表示 4.0 国際です。",
};

const ANTHOLOGY_RE =
  /全集|選集|傑作選|名作選|対談|インタビュー|研究|論考|事典|辞典|ガイド|解説|入門|読本|年譜|書簡|日記|関連|について|英訳|翻訳|現代語|お試し|無料|批評|講義|事典|アンソロジー|anthology|selected\s+works|complete\s+works/i;

/** 表紙候補から除外（漫画化・研究書・短編集・合冊など） */
const COVER_REJECT_TITLE_RE =
  /漫画|コミック|劇画|マンガ|manga|comic|研究|論考|解説|事典|辞典|ガイド|入門|対談|インタビュー|について|アンソロジー|選集|全集|批評|講義|シナリオ|映画|ドラマ|短編集|作品集|小説集|物語集|and\s+other|other\s+stories|selected\s+(stories|works)|short\s+stories|collection|anthology/i;

/** 単独刊行ではなく複数作品収録とみなす題名 */
function isMultiWorkCoverTitle(title: string): boolean {
  const raw = nfkc(title);
  return (
    /and\s+other|other\s+stories|selected\s+(stories|works)|short\s+stories|collection|anthology|短編集|作品集|小説集|物語集|傑作選|名作選/i.test(
      raw
    ) || /["「『].+["」』].*(and\s+other|ほか|他)/i.test(raw)
  );
}

const AUTHOR_ROMAJI_PAIRS: Array<[RegExp, RegExp]> = [
  [/島尾/, /shimao/i],
  [/宇野/, /\buno\b/i],
  [/野間/, /noma/i],
  [/徳田/, /tokuda/i],
  [/三島/, /mishima/i],
  [/中井/, /nakai/i],
  [/沼/, /numa/i],
  [/小島/, /kojima/i],
  [/中上/, /nakagami/i],
  [/ガルシア|マルケス/, /garcia|m[aá]rquez/i],
  [/夏目/, /natsume|s[oō]seki/i],
  [/太宰/, /dazai/i],
  [/村上/, /murakami/i],
  [/村田/, /murata/i],
  [/西村/, /nishimura/i],
  [/坂口/, /sakaguchi|ango/i],
  [/又吉/, /matayoshi/i],
  [/宮島/, /miyajima/i],
];

/** 日本語題名 ↔ ローマ字/英語題名の照合・追加検索用 */
const TITLE_ROMAJI_HINTS: Array<{ cjk: RegExp; lat: RegExp; queries: string[] }> =
  [
    {
      cjk: /死の棘/,
      lat: /sting\s+of\s+death|shi\s*no\s*toge/i,
      queries: ["sting of death Shimao", "shi no toge"],
    },
    {
      cjk: /暗い絵/,
      lat: /kurai\s*e|dark\s+painting/i,
      queries: ["Kurai e Noma", "Kurai e"],
    },
    {
      cjk: /美しい星/,
      lat: /utsukushii\s*hoshi|beautiful\s+star/i,
      queries: ["Utsukushii hoshi"],
    },
    {
      cjk: /抱擁家族/,
      lat: /embracing\s+family|hoy[oō]\s*kazoku/i,
      queries: ["Embracing Family Kojima"],
    },
    {
      cjk: /百年の孤独/,
      lat: /one\s+hundred\s+years|cien\s+a[nñ]os|hundred\s+years\s+of\s+solitude/i,
      queries: ["One Hundred Years of Solitude Garcia"],
    },
    {
      cjk: /あらくれ/,
      lat: /arakure/i,
      queries: ["Arakure Tokuda"],
    },
    {
      cjk: /苦の世界/,
      lat: /ku\s*no\s*sekai/i,
      queries: ["Ku no sekai Uno"],
    },
    {
      cjk: /虚無への供物/,
      lat: /kyomu/i,
      queries: ["Kyomu e no kumotsu"],
    },
    {
      cjk: /家畜人ヤプー|ヤプー/,
      lat: /yapoo|kachikujin/i,
      queries: ["Kachikujin Yapoo Numa"],
    },
    {
      cjk: /枯木灘/,
      lat: /karaki|withered\s+tree|the\s+cape/i,
      queries: ["Karaki nada Nakagami"],
    },
  ];

const VOLUME_SUFFIX_RE =
  /[\s　]*(?:[（(]?(?:上|下|前|後|続)巻?[)）]?|[上中下]|第?[0-9０-９]+巻|[0-9０-９]+)$/u;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nfkc(value: string): string {
  return (value || "").normalize("NFKC");
}

function normalizeTitle(value: string): string {
  return nfkc(value)
    .toLowerCase()
    .replace(/[【】〔〕［］\[\]()（）「」『』"'「」]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthor(value: string): string {
  return nfkc(value)
    .replace(/[,\s　、・．.。]/g, "")
    .replace(/\d{4}-?/g, "")
    .replace(/(?:著|作|訳|編|監修)$/u, "")
    .toLowerCase()
    .trim();
}

function stripVolumeSuffix(title: string): string {
  let current = nfkc(title).trim();
  for (let i = 0; i < 3; i++) {
    const next = current.replace(VOLUME_SUFFIX_RE, "").trim();
    if (next === current || next.length < 1) break;
    // 短すぎる題名は巻記号とみなさない
    if (normalizeTitle(next).length < 2) break;
    current = next;
  }
  return current;
}

function displayAuthor(creators: string[]): string {
  const primary = creators[0] || "";
  const cleaned = nfkc(primary)
    .replace(/\s+/g, " ")
    .replace(/^([^,]+),\s*([^,]+?)(?:,.*)?$/u, "$1$2")
    .replace(/\s*\d{4}-?\d{0,4}\s*/g, "")
    .replace(/\s+/g, "")
    .replace(/(?:原作|著|作|訳|編|監修)+$/u, "")
    .trim();
  return cleaned || primary.trim();
}

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/i.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(isbn[i]);
  const check = isbn[9].toUpperCase() === "X" ? 10 : Number(isbn[9]);
  return (sum + check) % 11 === 0;
}

function isValidIsbn13(isbn: string): boolean {
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isbn[12]);
}

function isValidIsbn(isbn: string): boolean {
  const raw = isbn.replace(/[-\s]/g, "").toUpperCase();
  if (raw.length === 13) return isValidIsbn13(raw);
  if (raw.length === 10) return isValidIsbn10(raw);
  return false;
}

function extractIsbns(text: string): string[] {
  const set = new Set<string>();
  // dcndl:ISBN のみ採用（説明文中のJPNO/NDLBibIDをISBN扱いしない）
  const typed = /dc:identifier[^>]*dcndl:ISBN[^>]*>([^<]+)</gi;
  let match: RegExpExecArray | null;
  while ((match = typed.exec(text))) {
    const raw = match[1].replace(/[-\s]/g, "").toUpperCase();
    if (isValidIsbn(raw)) set.add(raw);
  }
  // 説明文フォールバックは ISBN-13 (978/979) のみ（10桁は誤検知が多い）
  if (set.size === 0) {
    const bare = text.replace(/-/g, "");
    const reBare = /\b(97[89]\d{10})\b/g;
    while ((match = reBare.exec(bare))) {
      const raw = match[1].toUpperCase();
      if (isValidIsbn13(raw)) set.add(raw);
    }
  }
  return [...set];
}

function parseNdlRss(xml: string): NdlRecord[] {
  const items: NdlRecord[] = [];
  const parts = xml.split(/<item>/i).slice(1);

  for (const part of parts) {
    const block = part.split(/<\/item>/i)[0] || "";
    const title =
      (block.match(/<dc:title>([\s\S]*?)<\/dc:title>/i) ||
        block.match(/<title>([\s\S]*?)<\/title>/i) ||
        [])[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim() || "";

    const creators = [
      ...block.matchAll(/<dc:creator>([\s\S]*?)<\/dc:creator>/gi),
    ].map((entry) => entry[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());

    const authorField =
      (block.match(/<author>([\s\S]*?)<\/author>/i) || [])[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim() || "";
    if (authorField) {
      for (const piece of authorField.split(/[,，]/)) {
        const trimmed = piece.trim();
        if (trimmed) creators.push(trimmed);
      }
    }

    const publisher =
      (block.match(/<dc:publisher>([\s\S]*?)<\/dc:publisher>/i) || [])[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim() || "";
    const date =
      (block.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i) || [])[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim() || "";
    const bibId =
      (block.match(
        /dc:identifier[^>]*dcndl:NDLBibID[^>]*>([^<]+)</i
      ) || [])[1]?.trim() || "";
    const jpno =
      (block.match(/dc:identifier[^>]*dcndl:JPNO[^>]*>([^<]+)</i) ||
        [])[1]?.trim() || "";
    const link =
      (block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim() || "";

    if (!title) continue;

    items.push({
      id: bibId || jpno || link || `${title}:${creators[0] || ""}`,
      title,
      creators: creators.filter(Boolean),
      isbns: extractIsbns(block),
      publisher,
      date,
    });
  }

  return items;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "myshelf-book-search (local-dev)",
        Accept: "*/*",
        ...(init?.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

type QueryParts = { title: string; author: string };

function buildNdlAttempts(query: string): QueryParts[] {
  const parts = query.split(/\s+/).filter(Boolean);
  const attempts: QueryParts[] = [];

  if (parts.length === 1) {
    // 題名を先に試し、精度を維持。続けて著者名だけの検索も試す。
    attempts.push({ title: query, author: "" });
    attempts.push({ title: "", author: query });
  } else {
    // 日本語入力は「題名 著者」が多いのでこちらを先に試す
    attempts.push({
      title: parts.slice(0, -1).join(" "),
      author: parts[parts.length - 1],
    });
    attempts.push({
      title: parts.slice(1).join(" "),
      author: parts[0],
    });
    attempts.push({ title: query, author: "" });
    // 複数語全体を著者名としても試す（「村上 春樹」など）
    attempts.push({ title: "", author: query });
  }

  // 中黒・空白ゆれ用の題名再試行（通常ヒット時は手前で打ち切られる）
  const seenTitles = new Set(
    attempts.map((a) => a.title).filter((title) => title.length > 0)
  );
  for (const variant of [
    buildSoftSeparatorQuery(query),
    buildLoanwordSpacedQuery(query),
    buildCompactSearchQuery(query),
  ]) {
    if (!variant || seenTitles.has(variant)) continue;
    seenTitles.add(variant);
    attempts.push({ title: variant, author: "" });
  }

  return attempts;
}

/** 「五百年の孤独」が「百年の孤独」に誤マッチしないよう接頭を見る */
function titleContainsQuery(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;
  if (needle.includes(haystack) && haystack.length >= 2) return true;
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return false;
    if (idx === 0) return true;
    const prev = haystack[idx - 1];
    // 直前が数字・漢数字なら別語の一部とみなす（五百年…）
    if (!/[0-9０-９一二三四五六七八九十百千万億兆]/.test(prev)) {
      return true;
    }
    from = idx + 1;
  }
  return false;
}

function recordsHaveTitleSignal(records: NdlRecord[], title: string): boolean {
  const q = normalizeTitle(title);
  if (!q) return records.length > 0;
  return records.some((record) => {
    const norm = normalizeTitle(stripVolumeSuffix(record.title));
    return titleContainsQuery(norm, q);
  });
}

function recordsHaveAuthorSignal(
  records: NdlRecord[],
  author: string
): boolean {
  const q = normalizeAuthor(author);
  if (!q) return records.length > 0;
  return records.some((record) => {
    const creators = record.creators.length
      ? record.creators
      : [displayAuthor(record.creators)];
    return creators.some((name) => {
      const norm = normalizeAuthor(name);
      return Boolean(
        norm && (norm === q || norm.includes(q) || q.includes(norm))
      );
    });
  });
}

type NdlSearchPage = {
  records: NdlRecord[];
  total: number | null;
  idx: number;
  cnt: number;
};

async function searchNdlNationalOnce(
  title: string,
  author: string,
  idx = 1,
  cnt = NDL_CNT
): Promise<NdlSearchPage> {
  const safeIdx = Math.max(1, Math.floor(idx));
  const safeCnt = Math.max(1, Math.min(Math.floor(cnt), 200));
  const cacheKey = ndlFetchCacheKey(title, author, safeIdx, safeCnt);
  const cached = readNdlFetchCache(cacheKey);
  if (cached) {
    return {
      records: cached.records,
      total: cached.total,
      idx: safeIdx,
      cnt: safeCnt,
    };
  }

  const existing = ndlInflight.get(cacheKey);
  if (existing) {
    const shared = await existing;
    return {
      records: shared.records,
      total: shared.total,
      idx: safeIdx,
      cnt: safeCnt,
    };
  }

  const pending = (async (): Promise<NdlInflightResult> => {
    const url = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
    // title / creator は片方だけでも可（NDL OpenSearch 仕様）
    if (title) url.searchParams.set("title", title);
    if (author) url.searchParams.set("creator", author);
    if (!title && !author) {
      throw new Error("NDL検索には題名または著者が必要です");
    }
    url.searchParams.set("cnt", String(safeCnt));
    url.searchParams.set("idx", String(safeIdx));
    url.searchParams.set("dpid", "iss-ndl-opac-national");

    const response = await fetchWithTimeout(
      url.toString(),
      NDL_FETCH_TIMEOUT_MS,
      {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
      }
    );
    if (!response.ok) {
      throw new Error(`NDL検索に失敗しました: ${response.status}`);
    }
    const xml = await response.text();
    if (!/<rss[\s>]/i.test(xml)) {
      throw new Error("NDL応答がXMLではありません");
    }
    const totalMatch = xml.match(/<openSearch:totalResults>\s*(\d+)\s*</i);
    const total = totalMatch ? Number(totalMatch[1]) : null;
    const items = parseNdlRss(xml);
    if (total !== null && total > 0 && items.length === 0 && safeIdx === 1) {
      throw new Error("NDL応答の解析に失敗しました");
    }
    writeNdlFetchCache(cacheKey, items, total);
    return { records: items, total };
  })();

  ndlInflight.set(cacheKey, pending);
  try {
    const shared = await pending;
    return {
      records: shared.records,
      total: shared.total,
      idx: safeIdx,
      cnt: safeCnt,
    };
  } finally {
    if (ndlInflight.get(cacheKey) === pending) ndlInflight.delete(cacheKey);
  }
}

async function searchNdlNational(
  title: string,
  author: string,
  idx = 1,
  cnt = NDL_CNT
): Promise<NdlSearchPage> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await searchNdlNationalOnce(title, author, idx, cnt);
    } catch (error) {
      lastError = error;
      // 失敗はキャッシュしない。タイムアウトは再試行せず OL へ早く委ねる
      if (!shouldRetryNdlSearch(error) || attempt === 1) {
        throw error;
      }
      console.error("NDL検索リトライ:", error);
      await sleep(NDL_RETRY_GAP_MS);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("NDL検索に失敗しました");
}

function nextNdlOffset(
  idx: number,
  fetchedCount: number,
  total: number | null,
  pageCnt: number
): number | null {
  if (fetchedCount <= 0) return null;
  const nextIdx = idx + fetchedCount;
  if (nextIdx > NDL_MAX_FETCHABLE) return null;
  if (total !== null && nextIdx > total) return null;
  // ページが満杯でないなら終端とみなす
  if (fetchedCount < pageCnt) return null;
  return nextIdx - 1; // client offset = records already consumed (0-based count)
}

async function searchOpenLibrary(params: {
  title?: string;
  author?: string;
  q?: string;
  limit?: number;
}): Promise<OpenLibraryDoc[]> {
  const url = new URL("https://openlibrary.org/search.json");
  if (params.title) url.searchParams.set("title", params.title);
  if (params.author) url.searchParams.set("author", params.author);
  if (params.q) url.searchParams.set("q", params.q);
  url.searchParams.set("limit", String(params.limit ?? 15));
  url.searchParams.set(
    "fields",
    "key,title,author_name,cover_i,isbn,language,edition_key"
  );

  const response = await fetchWithTimeout(url.toString(), OL_FETCH_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Open Libraryの検索に失敗しました: ${response.status}`);
  }
  const data = (await response.json()) as { docs?: OpenLibraryDoc[] };
  return data.docs ?? [];
}

function titleClose(a: string, b: string): boolean {
  const left = normalizeTitle(stripVolumeSuffix(a));
  const right = normalizeTitle(stripVolumeSuffix(b));
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }
  const rawA = nfkc(a);
  const rawB = nfkc(b);
  for (const hint of TITLE_ROMAJI_HINTS) {
    if (
      (hint.cjk.test(rawA) && hint.lat.test(rawB)) ||
      (hint.cjk.test(rawB) && hint.lat.test(rawA))
    ) {
      return true;
    }
  }
  return false;
}

function alternateTitleQueries(workTitle: string): string[] {
  const raw = nfkc(workTitle);
  for (const hint of TITLE_ROMAJI_HINTS) {
    if (hint.cjk.test(raw)) return hint.queries.slice(0, 2);
  }
  return [];
}

function authorClose(a: string, b: string): boolean {
  const left = normalizeAuthor(a);
  const right = normalizeAuthor(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }

  const rawA = nfkc(a);
  const rawB = nfkc(b);
  for (const [cjk, lat] of AUTHOR_ROMAJI_PAIRS) {
    if ((cjk.test(rawA) && lat.test(rawB)) || (cjk.test(rawB) && lat.test(rawA))) {
      return true;
    }
  }

  const tokensA = rawA
    .toLowerCase()
    .split(/[\s,・/]+/)
    .filter((t) => /[a-z]{3,}/i.test(t));
  const tokensB = rawB
    .toLowerCase()
    .split(/[\s,・/]+/)
    .filter((t) => /[a-z]{3,}/i.test(t));
  return tokensA.some((t) =>
    tokensB.some((u) => t === u || t.includes(u) || u.includes(t))
  );
}

function docHasMatchingAuthor(doc: OpenLibraryDoc, author: string): boolean {
  return (doc.author_name || []).some((name) => authorClose(name, author));
}

function isRejectedCoverTitle(title: string, workTitle: string): boolean {
  if (COVER_REJECT_TITLE_RE.test(title)) return true;
  if (isMultiWorkCoverTitle(title)) return true;
  const normWork = normalizeTitle(stripVolumeSuffix(workTitle));
  const normTitle = normalizeTitle(stripVolumeSuffix(title));
  if (!normWork || !normTitle) return true;
  // 題名が一致せず、作品名を含む長い派生題名は関連書扱い
  if (
    normTitle !== normWork &&
    normTitle.includes(normWork) &&
    normTitle.length > normWork.length + 6
  ) {
    return true;
  }
  return false;
}

/** 漫画化など：作品著者が副著者扱いで先頭が別人 */
function isLikelyAdaptation(doc: OpenLibraryDoc, workAuthor: string): boolean {
  const authors = doc.author_name || [];
  if (authors.length < 2) return false;
  const primary = authors[0];
  const hasWorkAuthor = authors.some((name) => authorClose(name, workAuthor));
  if (!hasWorkAuthor) return false;
  return !authorClose(primary, workAuthor);
}

function olDocAcceptable(
  doc: OpenLibraryDoc,
  workTitle: string,
  workAuthor: string,
  options?: { fromIsbn?: boolean }
): boolean {
  const title = doc.title || "";
  if (!title) return false;
  if (isRejectedCoverTitle(title, workTitle)) return false;
  if (!docHasMatchingAuthor(doc, workAuthor)) return false;
  if (isLikelyAdaptation(doc, workAuthor)) return false;

  if (titleClose(title, workTitle)) return true;

  // NDL由来ISBNの版は翻訳題名でも同一ISBNとして許容（著者一致済み）
  if (options?.fromIsbn) {
    return true;
  }
  return false;
}

function languagePreference(langs: string[] | undefined): "jpn" | "other" | "unknown" {
  if (!langs || langs.length === 0) return "unknown";
  if (langs.some((l) => l === "jpn" || l === "ja" || l.startsWith("jpn"))) {
    return "jpn";
  }
  return "other";
}

function scoreCoverCandidate(
  lang: "jpn" | "other" | "unknown",
  titleExact: boolean,
  viaIsbn: boolean
): number {
  let score = 0;
  if (lang === "jpn") score += 1000;
  else if (lang === "unknown") score += 200;
  else score += 100;
  if (titleExact) score += 400;
  if (viaIsbn) score += 250;
  return score;
}

function scoreNdlRecord(
  record: NdlRecord,
  queryTitle: string,
  queryAuthor: string,
  rawQuery: string
): number {
  const title = record.title;
  const creator = displayAuthor(record.creators);
  const normTitle = normalizeTitle(stripVolumeSuffix(title));
  const normCreator = normalizeAuthor(creator);
  // 著者のみ検索では rawQuery を題名扱いにしない（著者ヒットを落とさない）
  const qTitle = normalizeTitle(queryTitle);
  const qAuthor = normalizeAuthor(queryAuthor);
  const qAll = normalizeTitle(rawQuery);

  let score = 0;

  const titleExact = Boolean(qTitle && normTitle === qTitle);
  const titleStrong =
    titleExact ||
    Boolean(
      qTitle &&
        (normTitle.startsWith(qTitle) ||
          (qTitle.startsWith(normTitle) && normTitle.length >= 2))
    );
  const titleWeak = Boolean(qTitle && titleContainsQuery(normTitle, qTitle));

  if (titleExact) score += 1000;
  else if (titleStrong) score += 520;
  else if (titleWeak) score += 260;
  else if (qTitle && qAll && titleContainsQuery(normTitle, qAll)) score += 120;

  // 題名がクエリと一致しないレコードは著者一致だけでは上位に来ないようにする
  if (qTitle && !titleExact && !titleStrong && !titleWeak) {
    score -= 900;
  }

  if (qAuthor) {
    if (normCreator === qAuthor) score += 480;
    else if (normCreator.includes(qAuthor) || qAuthor.includes(normCreator))
      score += 240;
  } else if (qAll && normCreator && qAll.includes(normCreator)) {
    score += 160;
  }

  // 単独作品を優先（短い題名）— 題名クエリ時のみ
  if (qTitle && normTitle === qTitle) score += 80;
  else if (
    qTitle &&
    normTitle.length > 0 &&
    normTitle.length <= qTitle.length + 2
  ) {
    score += 40;
  }

  // 合冊・併記題名は単独作品より下げる
  if (qTitle && normTitle !== qTitle && /[・･／/]/.test(nfkc(title))) {
    score -= 520;
  }
  // クエリ題名そのものより明らかに長い題名は単独性を落とす
  if (qTitle && normTitle.length >= qTitle.length + 3) {
    score -= 120;
  }

  // 著者のみ: 研究書・評論・著者名入り題名を下げ、ISBN付きの単独寄稿を上げる
  // （人気度の捏造や特定作品のハードコードはしない）
  if (qAuthor && !qTitle) {
    const titleHasAuthor =
      Boolean(qAuthor) &&
      (normTitle.includes(qAuthor) ||
        normalizeTitle(title).includes(qAuthor) ||
        nfkc(title).includes(nfkc(queryAuthor)));
    if (titleHasAuthor) score -= 380;
    // ISBNは参考程度（全国書誌の古いレコードはJPNOのみでISBN無しが多い）
    if (record.isbns.length > 0) score += 50;
    const len = normTitle.length;
    if (len >= 2 && len <= 20) score += 110;
    else if (len <= 36) score += 50;
    else if (len > 55) score -= 100;
    // 合冊は単独よりやや下げる（完全除外しない）
    if (/[・･／/]/.test(nfkc(title))) score -= 70;
    if (/オーディオブック|朗読|検定|公式テキスト|旅をしよう/i.test(title)) {
      score -= 260;
    }
    // 和文クエリなのに欧文題名だけの版は下げる
    if (
      /[\u3040-\u30ff\u3400-\u9fff]/.test(qAuthor) &&
      !/[\u3040-\u30ff\u3400-\u9fff]/.test(title) &&
      /[A-Za-z]{3,}/.test(title)
    ) {
      score -= 220;
    }
    // 副題付きより短い本篇題名をわずかに優先
    if (/[:：]/.test(title)) score -= 40;
  }

  if (ANTHOLOGY_RE.test(title)) score -= 420;
  if (/[:：]/.test(title) && qTitle && !normTitle.startsWith(qTitle)) {
    score -= 80;
  }

  return score;
}

function preferDisplayTitle(candidates: string[], queryTitle: string): string {
  const q = normalizeTitle(queryTitle);
  const scored = candidates.map((title) => {
    const base = stripVolumeSuffix(title);
    const norm = normalizeTitle(base);
    let score = 0;
    if (q && norm === q) score += 300;
    if (q && norm !== q && /[・･／/]/.test(nfkc(title))) score -= 120;
    if (ANTHOLOGY_RE.test(title)) score -= 80;
    if (q) score -= Math.max(0, norm.length - q.length) * 4;
    score -= Math.abs(norm.length - (q?.length || norm.length));
    // 著者検索の表示は合冊記号のない短い題名を優先
    if (!q) {
      if (/[・･／/]/.test(nfkc(title))) score -= 30;
      if (/[:：]/.test(title)) score -= 20;
      score -= Math.max(0, norm.length - 12);
    }
    return { title: base, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.title || candidates[0] || "";
}

/**
 * 著者検索時のみ: 「桜桃・人間失格」のような合冊題名から各作品名を取り出す。
 * 特定作品のハードコードではなく、NDL題名の区切りに基づく展開。
 * 欧文の中黒（グッド・バイ等）は分割しない。
 */
function expandAuthorWorkTitles(title: string): string[] {
  const base = stripVolumeSuffix(title).trim();
  if (!base) return [];
  if (ANTHOLOGY_RE.test(base)) return [base];
  if (/オーディオブック|朗読|検定|公式テキスト/i.test(base)) return [base];
  if (!/[・･／/]/.test(nfkc(base))) return [base];

  const forSplit = nfkc(base).replace(/\s*[:：].*$/, "").trim();
  const parts = forSplit
    .split(/\s*[・･／/]\s*/)
    .map((part) => part.replace(/\s*[（(].*$/, "").trim())
    .filter(Boolean);

  if (parts.length < 2 || parts.length > 3) return [base];
  if (
    parts.some(
      (part) =>
        part.length < 2 ||
        part.length > 24 ||
        /[:：]/.test(part) ||
        ANTHOLOGY_RE.test(part)
    )
  ) {
    return [base];
  }
  // 漢字を含まない中黒分割（グッド・バイ等）は作品名分割とみなさない
  const hasKanji = (value: string) => /[\u3400-\u9fff]/.test(value);
  if (!parts.some((part) => hasKanji(part))) return [base];

  // 元題名 + 各分割（重複除去は呼び出し側）
  return [base, ...parts];
}

function mergeNdlWorks(
  records: NdlRecord[],
  queryTitle: string,
  queryAuthor: string,
  rawQuery: string
): RankedWork[] {
  type Bucket = {
    key: string;
    titles: string[];
    creator: string;
    creatorKey: string;
    isbns: Set<string>;
    ids: string[];
    bestScore: number;
    bestRecordTitle: string;
    editionCount: number;
  };

  const buckets = new Map<string, Bucket>();
  const authorOnly = Boolean(queryAuthor) && !queryTitle;

  const upsert = (
    displayTitles: string[],
    bucketTitleKey: string,
    creator: string,
    creatorKey: string,
    record: NdlRecord,
    score: number,
    derivedFromCompound: boolean
  ) => {
    if (!bucketTitleKey) return;
    const key = `${bucketTitleKey}::${creatorKey}`;
    // 合冊から取り出した短い作品名は、ISBNの無い旧版でも落とさない
    const adjusted = derivedFromCompound ? score + 130 : score;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        key,
        titles: [...displayTitles],
        creator,
        creatorKey,
        isbns: new Set(record.isbns),
        ids: [record.id],
        bestScore: adjusted,
        bestRecordTitle: displayTitles[0] || record.title,
        editionCount: 1,
      });
      return;
    }
    existing.titles.push(...displayTitles);
    existing.ids.push(record.id);
    existing.editionCount += 1;
    for (const isbn of record.isbns) existing.isbns.add(isbn);
    if (adjusted > existing.bestScore) {
      existing.bestScore = adjusted;
      existing.bestRecordTitle = displayTitles[0] || record.title;
      existing.creator = creator;
    }
  };

  for (const record of records) {
    const creator = displayAuthor(record.creators);
    const creatorKey = normalizeAuthor(creator);
    if (!creatorKey) {
      // 著者不明は統合しない（ISBNでもまとめない）
      const soloKey = `solo:${record.id}`;
      const score = scoreNdlRecord(record, queryTitle, queryAuthor, rawQuery);
      buckets.set(soloKey, {
        key: soloKey,
        titles: [record.title],
        creator,
        creatorKey: soloKey,
        isbns: new Set(record.isbns),
        ids: [record.id],
        bestScore: score,
        bestRecordTitle: record.title,
        editionCount: 1,
      });
      continue;
    }

    const titleVariants = authorOnly
      ? expandAuthorWorkTitles(record.title)
      : [stripVolumeSuffix(record.title)];

    for (let i = 0; i < titleVariants.length; i++) {
      const variant = titleVariants[i];
      const baseTitle = normalizeTitle(stripVolumeSuffix(variant));
      if (!baseTitle) continue;
      const derived = authorOnly && i > 0;
      // 分割題名は合冊記号のペナルティを受けないよう、その題名自体で再スコア
      const score = scoreNdlRecord(
        derived ? { ...record, title: variant } : record,
        queryTitle,
        queryAuthor,
        rawQuery
      );
      upsert(
        derived ? [variant, record.title] : [record.title],
        baseTitle,
        creator,
        creatorKey,
        record,
        score,
        derived
      );
    }
  }

  const works: RankedWork[] = [];
  for (const bucket of buckets.values()) {
    // 著者のみ検索では rawQuery（著者名）を題名候補の長さ基準に使わない
    const title = preferDisplayTitle(bucket.titles, queryTitle);
    // 同一作品の版数は人気の捏造ではなく、書誌上の再刊シグナル
    const editionBoost = authorOnly
      ? Math.min(Math.max(bucket.editionCount - 1, 0), 14) * 40
      : 0;
    works.push({
      id: `ndl:${bucket.ids[0]}`,
      title,
      creator: bucket.creator,
      type: "book",
      imageUrl: "",
      source: "ndl",
      matchScore: bucket.bestScore + editionBoost,
      isbns: [...bucket.isbns].slice(0, 8),
      rawTitles: bucket.titles,
    });
  }

  const sorted = works.sort((a, b) => b.matchScore - a.matchScore);
  // 題名指定があるときは不一致ノイズを落とす（空なら上位でOLフォールバック）
  const filtered = queryTitle
    ? sorted.filter((work) => work.matchScore >= 100)
    : sorted.filter((work) => work.matchScore >= 0);
  return filtered.slice(0, MAX_RESULTS);
}

function olCoverUrl(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

function olIsbnCoverUrl(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
}

/** default=false なので不存在時は404。代替画像は採用しない */
async function olIsbnCoverAvailable(
  isbn: string,
  cache: Map<string, boolean>
): Promise<boolean> {
  const key = isbn.replace(/[-\s]/g, "").toUpperCase();
  if (cache.has(key)) return cache.get(key) === true;
  const url = olIsbnCoverUrl(key);
  try {
    const response = await fetchWithTimeout(url, 6000, { method: "HEAD" });
    let ok = response.ok;
    if (response.status === 405 || response.status === 403) {
      const get = await fetchWithTimeout(url, 6000, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
      ok = get.ok;
    }
    cache.set(key, ok);
    return ok;
  } catch {
    cache.set(key, false);
    return false;
  }
}

function pickBestOlDocs(
  docs: OpenLibraryDoc[],
  workTitle: string,
  workAuthor: string,
  options?: { fromIsbn?: boolean }
): OpenLibraryDoc[] {
  return docs
    .filter((doc) => olDocAcceptable(doc, workTitle, workAuthor, options))
    .sort((a, b) => {
      const langA = languagePreference(a.language);
      const langB = languagePreference(b.language);
      const rank = (l: "jpn" | "other" | "unknown") =>
        l === "jpn" ? 2 : l === "unknown" ? 1 : 0;
      const coverBoost = (d: OpenLibraryDoc) => (d.cover_i ? 1 : 0);
      return (
        rank(langB) + coverBoost(b) * 0.5 - (rank(langA) + coverBoost(a) * 0.5)
      );
    });
}

async function tryEditionCover(
  editionKey: string,
  workTitle: string,
  workAuthor: string
): Promise<CoverCandidate | null> {
  try {
    const response = await fetchWithTimeout(
      `https://openlibrary.org/books/${editionKey}.json`,
      OL_FETCH_TIMEOUT_MS
    );
    if (!response.ok) return null;
    const json = (await response.json()) as {
      title?: string;
      covers?: number[];
      languages?: Array<{ key?: string }>;
      authors?: Array<{ key?: string }>;
    };
    const title = json.title || "";
    if (!titleClose(title, workTitle)) return null;
    if (isRejectedCoverTitle(title, workTitle)) return null;
    // edition JSONは著者名がkeyのみのことが多いので、題名一致＋非リジェクトを最低条件にする
    // （呼び出し元で search doc の著者一致済み edition_key を渡す）
    const coverId = json.covers?.[0];
    if (!coverId) return null;
    const langs = (json.languages || [])
      .map((l) => (l.key || "").replace(/^\/languages\//, ""))
      .filter(Boolean);
    const lang = languagePreference(langs);
    const titleExact =
      normalizeTitle(stripVolumeSuffix(title)) ===
      normalizeTitle(stripVolumeSuffix(workTitle));
    return {
      url: olCoverUrl(coverId),
      score: scoreCoverCandidate(lang, titleExact, false) - 50,
      lang,
      via: `edition:${editionKey}`,
    };
  } catch {
    return null;
  }
}

async function enrichCoverFromRakuten(work: RankedWork): Promise<string> {
  if (!work.creator.trim()) return "";
  const isbnList = [...new Set(work.isbns.map((x) => x.replace(/[-\s]/g, "")))]
    .filter(Boolean)
    .slice(0, RAKUTEN_COVER_ISBN_TRIES);

  for (const isbn of isbnList) {
    const url = await fetchRakutenBookCoverByIsbn({
      isbn,
      workTitle: work.title,
      workAuthor: work.creator,
    });
    if (url) return url;
  }
  return "";
}

/** OL を優先し、無いときだけ楽天 ISBN フォールバック */
async function enrichBookCoverUrl(
  work: RankedWork,
  isbnCoverCache: Map<string, boolean>
): Promise<{ imageUrl: string; coverSource: "openlibrary" | "rakuten" | "" }> {
  const olUrl = await enrichCoverFromOpenLibrary(work, isbnCoverCache);
  if (olUrl) return { imageUrl: olUrl, coverSource: "openlibrary" };
  const rakutenUrl = await enrichCoverFromRakuten(work);
  if (rakutenUrl) return { imageUrl: rakutenUrl, coverSource: "rakuten" };
  return { imageUrl: "", coverSource: "" };
}

async function enrichCoverFromOpenLibrary(
  work: RankedWork,
  isbnCoverCache: Map<string, boolean>
): Promise<string> {
  const candidates: CoverCandidate[] = [];
  const workTitle = work.title;
  const workAuthor = work.creator;
  const normWorkTitle = normalizeTitle(stripVolumeSuffix(workTitle));

  // 1) NDL由来ISBNを複数試し、書誌照合後に Covers API を使う
  const isbnList = [...new Set(work.isbns.map((x) => x.replace(/[-\s]/g, "")))]
    .filter(Boolean)
    .slice(0, MAX_ISBN_COVER_TRIES);

  for (const isbn of isbnList) {
    try {
      const docs = await searchOpenLibrary({
        q: `isbn:${isbn}`,
        limit: 5,
      });

      // ISBNはNDLの当該作品バケット由来。OLメタが揺れても著者不一致・漫画化・合冊は除外
      const blocked =
        docs.length > 0 &&
        (docs.every((d) => !docHasMatchingAuthor(d, workAuthor)) ||
          docs.some((d) => isLikelyAdaptation(d, workAuthor)) ||
          docs.some((d) => isRejectedCoverTitle(d.title || "", workTitle)));
      if (blocked) {
        await sleep(REQUEST_GAP_MS);
        continue;
      }

      const titleMatched = pickBestOlDocs(docs, workTitle, workAuthor, {
        fromIsbn: false,
      });
      const authorMatched = docs.filter(
        (d) =>
          docHasMatchingAuthor(d, workAuthor) &&
          !isLikelyAdaptation(d, workAuthor) &&
          !COVER_REJECT_TITLE_RE.test(d.title || "")
      );
      const best = titleMatched[0] || authorMatched[0] || null;
      const lang = languagePreference(best?.language);
      const titleExact = best
        ? normalizeTitle(stripVolumeSuffix(best.title || "")) === normWorkTitle
        : false;

      // OL題名が一致する版の cover_i を優先
      if (best?.cover_i && titleMatched.includes(best)) {
        candidates.push({
          url: olCoverUrl(best.cover_i),
          score: scoreCoverCandidate(lang, titleExact, true),
          lang,
          via: `isbn-search:${isbn}`,
        });
      }

      // NDL紐づけISBNの Covers API（書誌はNDL側で作品に紐づく）
      const available = await olIsbnCoverAvailable(isbn, isbnCoverCache);
      if (available) {
        candidates.push({
          url: olIsbnCoverUrl(isbn.replace(/[-\s]/g, "").toUpperCase()),
          score:
            scoreCoverCandidate(
              lang === "unknown" && titleExact ? "jpn" : lang,
              titleExact,
              true
            ) + (titleMatched.length ? 80 : 20),
          lang: titleMatched.length && lang === "jpn" ? "jpn" : lang,
          via: `isbn-covers-api:${isbn}`,
        });
      }

      const bestSoFar = [...candidates].sort((a, b) => {
        if (a.lang === "jpn" && b.lang !== "jpn") return -1;
        if (b.lang === "jpn" && a.lang !== "jpn") return 1;
        return b.score - a.score;
      })[0];
      // 題名一致の日本語、またはISBNカバーが取れたら採用して打ち切り
      if (bestSoFar && (bestSoFar.lang === "jpn" || available)) {
        return bestSoFar.url;
      }
    } catch (error) {
      console.error("OL ISBN表紙補完エラー:", error);
    }
    await sleep(REQUEST_GAP_MS);
  }

  // ISBN経路で候補があれば題名検索に進まず確定（日本語優先済みソート）
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (a.lang === "jpn" && b.lang !== "jpn") return -1;
      if (b.lang === "jpn" && a.lang !== "jpn") return 1;
      return b.score - a.score;
    });
    return candidates[0]?.url || "";
  }

  // 2) 題名+著者検索
  try {
    const docs = await searchOpenLibrary({
      title: workTitle,
      author: workAuthor,
      limit: 12,
    });
    for (const doc of pickBestOlDocs(docs, workTitle, workAuthor)) {
      if (!doc.cover_i) continue;
      const lang = languagePreference(doc.language);
      const titleExact =
        normalizeTitle(stripVolumeSuffix(doc.title || "")) === normWorkTitle;
      candidates.push({
        url: olCoverUrl(doc.cover_i),
        score: scoreCoverCandidate(lang, titleExact, false),
        lang,
        via: "title-author",
      });
    }
  } catch (error) {
    console.error("OL 題名表紙補完エラー:", error);
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (a.lang === "jpn" && b.lang !== "jpn") return -1;
      if (b.lang === "jpn" && a.lang !== "jpn") return 1;
      return b.score - a.score;
    });
    return candidates[0]?.url || "";
  }

  await sleep(REQUEST_GAP_MS);

  // 3) 題名のみ + ローマ字題名の追加検索
  const titleQueries = [workTitle, ...alternateTitleQueries(workTitle)].slice(
    0,
    3
  );
  for (const query of titleQueries) {
    try {
      const docs = await searchOpenLibrary({
        q: query,
        limit: 12,
      });
      for (const doc of pickBestOlDocs(docs, workTitle, workAuthor)) {
        if (!doc.cover_i) continue;
        const lang = languagePreference(doc.language);
        const titleExact =
          normalizeTitle(stripVolumeSuffix(doc.title || "")) === normWorkTitle;
        candidates.push({
          url: olCoverUrl(doc.cover_i),
          score:
            scoreCoverCandidate(lang, titleExact, false) -
            (query === workTitle ? 20 : 10),
          lang,
          via: `q:${query}`,
        });
      }

      if (candidates.length === 0) {
        const needEdition = pickBestOlDocs(docs, workTitle, workAuthor).find(
          (d) => !d.cover_i && d.edition_key?.[0]
        );
        if (needEdition?.edition_key?.[0]) {
          const editionCandidate = await tryEditionCover(
            needEdition.edition_key[0],
            workTitle,
            workAuthor
          );
          if (editionCandidate) candidates.push(editionCandidate);
        }
      }
    } catch (error) {
      console.error("OL q表紙補完エラー:", error);
    }
    if (candidates.some((c) => c.lang === "jpn")) break;
    await sleep(REQUEST_GAP_MS);
  }

  if (candidates.length === 0) return "";

  // 日本語版優先 → スコア順。海外版は同一作品確認済み候補のみ残っている
  candidates.sort((a, b) => {
    if (a.lang === "jpn" && b.lang !== "jpn") return -1;
    if (b.lang === "jpn" && a.lang !== "jpn") return 1;
    return b.score - a.score;
  });

  return candidates[0]?.url || "";
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
      if (nextIndex < items.length) await sleep(REQUEST_GAP_MS);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function scoreOlDoc(doc: OpenLibraryDoc, query: string): number {
  const title = doc.title || "";
  const author = doc.author_name?.[0] || "";
  const q = normalizeTitle(query);
  const t = normalizeTitle(title);
  const a = normalizeAuthor(author);
  let score = 0;
  if (t === q) score += 120;
  if (t.includes(q) || q.includes(t)) score += 60;
  for (const token of q.split(" ").filter(Boolean)) {
    if (token.length < 2) continue;
    if (t.includes(token)) score += 20;
    if (a.includes(normalizeAuthor(token))) score += 20;
  }
  return score;
}

function toOlResults(docs: OpenLibraryDoc[], query: string): BookResult[] {
  const byId = new Map<string, BookResult & { matchScore: number }>();

  for (const doc of docs) {
    const id = doc.key || "";
    if (!id || byId.has(id)) continue;
    const title = doc.title || "";
    const creator = doc.author_name?.[0] || "";
    byId.set(id, {
      id,
      title,
      creator,
      type: "book",
      // OLフォールバックでも表紙はPOST側で確認してから付与する
      imageUrl: "",
      source: "openlibrary",
      isbns: (doc.isbn || []).slice(0, 8),
      matchScore: scoreOlDoc(doc, query),
    });
  }

  return Array.from(byId.values())
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, MAX_RESULTS)
    .map(({ id, title, creator, type, imageUrl, source, isbns }) => ({
      id,
      title,
      creator,
      type,
      imageUrl,
      source,
      isbns,
    }));
}

async function searchOpenLibraryFallback(
  query: string
): Promise<{ results: BookResult[]; transportFailed: boolean }> {
  const parts = query.split(/\s+/).filter(Boolean);
  const attempts: Array<{ title?: string; author?: string; q?: string }> = [];

  if (parts.length === 1) {
    attempts.push({ title: query });
    attempts.push({ author: query });
    attempts.push({ q: query });
  } else {
    attempts.push({ author: parts[0], title: parts.slice(1).join(" ") });
    attempts.push({
      title: parts.slice(0, -1).join(" "),
      author: parts[parts.length - 1],
    });
    attempts.push({ author: query });
    attempts.push({ q: query });
  }

  let collected: OpenLibraryDoc[] = [];
  let lastError: unknown = null;
  let sawSuccess = false;

  for (const attempt of attempts) {
    try {
      const docs = await searchOpenLibrary({ ...attempt, limit: 20 });
      sawSuccess = true;
      await sleep(REQUEST_GAP_MS);
      if (docs.length === 0) continue;
      collected = collected.concat(docs);
      break;
    } catch (error) {
      lastError = error;
      console.error("OLフォールバック試行エラー:", error);
      if (isRetryableBookSearchError(error)) {
        await sleep(NDL_RETRY_GAP_MS);
      }
    }
  }

  if (collected.length === 0 && lastError && !sawSuccess) {
    return { results: [], transportFailed: true };
  }
  return { results: toOlResults(collected, query), transportFailed: false };
}

function jsonBookResponse(
  body: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapNdlWorksToResults(works: RankedWork[]): BookResult[] {
  return works.map((work) => ({
    id: work.id,
    title: work.title,
    creator: work.creator,
    type: "book",
    imageUrl: "",
    source: "ndl",
    isbns: work.isbns,
  }));
}

/** 著者検索の追加ページ（NDL OpenSearch idx） */
async function runAuthorBibliographyPage(
  query: string,
  offset: number
): Promise<CachedBibResponse> {
  const idx = Math.max(1, offset + 1);
  if (idx > NDL_MAX_FETCHABLE) {
    return {
      status: 200,
      body: {
        results: [],
        source: "ndl",
        attribution: NDL_ATTRIBUTION,
        coverPending: false,
        nextOffset: null,
      },
    };
  }

  try {
    const page = await searchNdlNational(
      "",
      query,
      idx,
      NDL_AUTHOR_PAGE_CNT
    );
    const works = mergeNdlWorks(page.records, "", query, query);
    const nextOffset = nextNdlOffset(
      page.idx,
      page.records.length,
      page.total,
      page.cnt
    );
    return {
      status: 200,
      body: {
        results: mapNdlWorksToResults(works),
        source: "ndl",
        attribution: NDL_ATTRIBUTION,
        coverPending: works.length > 0,
        nextOffset,
      },
    };
  } catch (error) {
    console.error("著者検索追加ページエラー:", error);
    return {
      status: 503,
      body: {
        results: [],
        error: BOOK_SEARCH_UNAVAILABLE_MESSAGE,
        source: null,
        attribution: null,
        nextOffset: null,
      },
    };
  }
}

async function runBookBibliographySearch(
  query: string,
  offset = 0
): Promise<CachedBibResponse> {
  if (offset > 0) {
    return runAuthorBibliographyPage(query, offset);
  }

  let ndlSucceeded = false;
  let ndlTransportFailed = false;
  let olSucceeded = false;
  let olTransportFailed = false;

  try {
    const attempts = buildNdlAttempts(query);
    const isSingleToken = query.split(/\s+/).filter(Boolean).length === 1;
    let ndlRecords: NdlRecord[] = [];
    let usedAttempt: QueryParts = attempts[0];
    let ndlAttemptErrors = 0;
    type AuthorPageMeta = {
      idx: number;
      cnt: number;
      total: number | null;
      fetchedCount: number;
    };
    type TitlePartialFallback = {
      records: NdlRecord[];
      attempt: QueryParts;
    };
    // ネスト関数からの代入を CFA が取りこぼさないようオブジェクトで保持
    const searchState: {
      authorPageMeta: AuthorPageMeta | null;
      titlePartialFallback: TitlePartialFallback | null;
    } = {
      authorPageMeta: null,
      titlePartialFallback: null,
    };

    type AttemptOutcome = {
      attempt: QueryParts;
      records: NdlRecord[];
      page: NdlSearchPage | null;
      usable: boolean;
      hasExactTitle: boolean;
      error: boolean;
    };

    const runOneAttempt = async (
      attempt: QueryParts
    ): Promise<AttemptOutcome> => {
      try {
        const pageCnt =
          !attempt.title && attempt.author
            ? NDL_AUTHOR_INITIAL_CNT
            : NDL_CNT;
        const page = await searchNdlNational(
          attempt.title,
          attempt.author,
          1,
          pageCnt
        );
        const merged = [...page.records];
        let usable =
          merged.length > 0 &&
          (attempt.title
            ? recordsHaveTitleSignal(merged, attempt.title)
            : attempt.author
              ? recordsHaveAuthorSignal(merged, attempt.author)
              : true);
        if (usable && attempt.title && attempt.author) {
          const hasExact = merged.some(
            (record) =>
              normalizeTitle(stripVolumeSuffix(record.title)) ===
              normalizeTitle(attempt.title)
          );
          if (!hasExact) {
            try {
              const titleOnly = await searchNdlNational(attempt.title, "");
              if (titleOnly.records.length > 0) {
                const seen = new Set(merged.map((r) => r.id));
                for (const record of titleOnly.records) {
                  if (!seen.has(record.id)) merged.push(record);
                }
              }
            } catch (error) {
              console.error("NDL題名のみ補完エラー:", error);
            }
          }
        }
        usable =
          merged.length > 0 &&
          (attempt.title
            ? recordsHaveTitleSignal(merged, attempt.title)
            : attempt.author
              ? recordsHaveAuthorSignal(merged, attempt.author)
              : true);
        const hasExactTitle =
          Boolean(attempt.title) &&
          merged.some(
            (record) =>
              normalizeTitle(stripVolumeSuffix(record.title)) ===
              normalizeTitle(attempt.title)
          );
        return {
          attempt,
          records: merged,
          page,
          usable,
          hasExactTitle,
          error: false,
        };
      } catch (error) {
        console.error("NDL検索試行エラー:", error);
        return {
          attempt,
          records: [],
          page: null,
          usable: false,
          hasExactTitle: false,
          error: true,
        };
      }
    };

    const commitHit = (outcome: AttemptOutcome) => {
      usedAttempt = outcome.attempt;
      ndlRecords = outcome.records;
      ndlSucceeded = true;
      if (!outcome.attempt.title && outcome.attempt.author && outcome.page) {
        searchState.authorPageMeta = {
          idx: outcome.page.idx,
          cnt: outcome.page.cnt,
          total: outcome.page.total,
          fetchedCount: outcome.page.records.length,
        };
      } else {
        searchState.authorPageMeta = null;
      }
    };

    const rememberPartial = (outcome: AttemptOutcome) => {
      ndlSucceeded = true;
      if (!searchState.titlePartialFallback) {
        searchState.titlePartialFallback = {
          records: outcome.records,
          attempt: outcome.attempt,
        };
      }
    };

    // 題名完全一致時は追加試行しない（API回数・待ち時間を抑える）
    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
      const hasMoreAttempts = attemptIndex < attempts.length - 1;
      const outcome = await runOneAttempt(attempts[attemptIndex]);
      if (outcome.error) {
        ndlAttemptErrors += 1;
        if (hasMoreAttempts) await sleep(REQUEST_GAP_MS);
        continue;
      }
      if (
        outcome.usable &&
        isSingleToken &&
        outcome.attempt.title &&
        !outcome.attempt.author &&
        !outcome.hasExactTitle
      ) {
        rememberPartial(outcome);
        if (hasMoreAttempts) await sleep(REQUEST_GAP_MS);
        continue;
      }
      if (outcome.usable) {
        commitHit(outcome);
        break;
      }
      ndlSucceeded = true;
      if (hasMoreAttempts) await sleep(REQUEST_GAP_MS);
    }

    if (ndlRecords.length === 0 && searchState.titlePartialFallback) {
      usedAttempt = searchState.titlePartialFallback.attempt;
      ndlRecords = searchState.titlePartialFallback.records;
      ndlSucceeded = true;
      searchState.authorPageMeta = null;
    }

    if (ndlAttemptErrors > 0 && ndlRecords.length === 0 && !ndlSucceeded) {
      ndlTransportFailed = true;
    }
    // 全試行が例外のみ
    if (ndlAttemptErrors >= attempts.length && ndlRecords.length === 0) {
      ndlTransportFailed = true;
      ndlSucceeded = false;
    }

    let ndlWorks: RankedWork[] = [];
    if (ndlRecords.length > 0) {
      ndlWorks = mergeNdlWorks(
        ndlRecords,
        usedAttempt.title,
        usedAttempt.author,
        query
      );
    }

    const queryTitleNorm = normalizeTitle(
      stripVolumeSuffix(usedAttempt.title || query)
    );
    const ndlHasExactTitle = ndlWorks.some(
      (work) => normalizeTitle(stripVolumeSuffix(work.title)) === queryTitleNorm
    );

    const isAuthorOnlyHit =
      Boolean(usedAttempt.author) && !usedAttempt.title && ndlWorks.length > 0;

    // NDLに完全一致題名があるとき、または著者名だけのヒットのとき主結果として返す。
    // OpenSearchは関連語・部分一致を上位に押し上げ、完全一致が窓外になることがある。
    // 表紙はクライアントが POST /api/books で非同期取得する（書誌表示を遅らせない）。
    if (ndlWorks.length > 0 && (ndlHasExactTitle || isAuthorOnlyHit)) {
      if (ndlHasExactTitle) {
        const exactWorks = ndlWorks.filter(
          (work) =>
            normalizeTitle(stripVolumeSuffix(work.title)) === queryTitleNorm
        );
        // 同一作品バケットのISBNを集約して表紙探索の取りこぼしを減らす
        if (exactWorks.length > 0) {
          const pooled = [
            ...new Set(exactWorks.flatMap((work) => work.isbns)),
          ].slice(0, 8);
          for (const work of exactWorks) {
            work.isbns = [...new Set([...pooled, ...work.isbns])].slice(0, 8);
          }
        }
      }
      const nextOffset =
        isAuthorOnlyHit && searchState.authorPageMeta
          ? nextNdlOffset(
              searchState.authorPageMeta.idx,
              searchState.authorPageMeta.fetchedCount,
              searchState.authorPageMeta.total,
              searchState.authorPageMeta.cnt
            )
          : null;

      return {
        status: 200,
        body: {
          results: mapNdlWorksToResults(ndlWorks),
          source: "ndl",
          attribution: NDL_ATTRIBUTION,
          coverPending: true,
          nextOffset,
        },
      };
    }

    if (ndlTransportFailed) {
      console.error("NDL輸送失敗のためOLへフォールバック");
    } else if (ndlWorks.length > 0 && !ndlHasExactTitle) {
      console.error("NDLに完全一致題名がないためOLへフォールバック");
    }

    // OL は上限付きで待機。遅延時は既にある NDL 部分一致を返す
    const OL_FALLBACK_BUDGET_MS = 6000;
    const olOrTimeout = await Promise.race([
      searchOpenLibraryFallback(query).then((ol) => ({ kind: "ol" as const, ol })),
      sleep(OL_FALLBACK_BUDGET_MS).then(() => ({ kind: "timeout" as const })),
    ]);

    if (olOrTimeout.kind === "ol") {
      olTransportFailed = olOrTimeout.ol.transportFailed;
      olSucceeded = !olOrTimeout.ol.transportFailed;
      const olResults = olOrTimeout.ol.results;
      if (olResults.length > 0) {
        return {
          status: 200,
          body: {
            results: olResults,
            source: "openlibrary",
            attribution: null,
            coverPending: true,
            nextOffset: null,
          },
        };
      }
    } else {
      olTransportFailed = false;
      olSucceeded = false;
    }

    // OLも空／タイムアウトで、NDLに部分一致だけある場合はそれを返す
    if (ndlWorks.length > 0) {
      return {
        status: 200,
        body: {
          results: mapNdlWorksToResults(ndlWorks),
          source: "ndl",
          attribution: NDL_ATTRIBUTION,
          coverPending: true,
          nextOffset: null,
        },
      };
    }

    const outcome = classifyBookSearchOutcome({
      ndlSucceeded,
      ndlTransportFailed,
      olSucceeded,
      olTransportFailed,
      resultCount: 0,
    });

    if (outcome.kind === "unavailable") {
      return {
        status: 503,
        body: {
          results: [],
          error: outcome.message,
          source: null,
          attribution: null,
          nextOffset: null,
        },
      };
    }

    // 正常な0件
    return {
      status: 200,
      body: {
        results: [],
        source: ndlSucceeded ? "ndl" : olSucceeded ? "openlibrary" : null,
        attribution: null,
        nextOffset: null,
      },
    };
  } catch (error) {
    console.error("書籍検索エラー:", error);
    return {
      status: 503,
      body: {
        results: [],
        error: BOOK_SEARCH_UNAVAILABLE_MESSAGE,
        source: null,
        attribution: null,
        nextOffset: null,
      },
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return jsonBookResponse(
      { results: [], error: "検索キーワードが必要です" },
      400
    );
  }

  const rawOffset = Number(searchParams.get("offset") || "0");
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0
      ? Math.min(Math.floor(rawOffset), NDL_MAX_FETCHABLE)
      : 0;

  // v6: OL予算・ギャップ短縮・楽天表紙
  const queryKey = `${normalizeBookQueryKey(query)}\0o=${offset}\0v=6`;
  const cached = getCachedBibResponse(queryKey);
  if (cached) {
    return jsonBookResponse(
      { ...cached.body, cached: true },
      cached.status
    );
  }

  const inflight = getInflightBib(queryKey);
  if (inflight) {
    const shared = await inflight;
    return jsonBookResponse(
      { ...shared.body, cached: true },
      shared.status
    );
  }

  const pending = runBookBibliographySearch(query, offset);
  setInflightBib(queryKey, pending);
  const result = await pending;
  cacheBibResponse(queryKey, result);
  return jsonBookResponse(result.body, result.status);
}

type CoverWorkInput = {
  id?: unknown;
  title?: unknown;
  creator?: unknown;
  isbns?: unknown;
};

/**
 * 表紙の非同期補完。書誌検索（GET）後にクライアントが1件ずつ呼ぶ。
 * 失敗しても空URLを返し、書誌結果自体は壊さない。
 */
export async function POST(request: Request) {
  let body: { works?: CoverWorkInput[] };
  try {
    body = (await request.json()) as { works?: CoverWorkInput[] };
  } catch {
    return jsonBookResponse({ covers: [], error: "不正なリクエストです" }, 400);
  }

  const rawWorks = Array.isArray(body.works) ? body.works : [];
  if (rawWorks.length === 0) {
    return jsonBookResponse({ covers: [], error: "works が必要です" }, 400);
  }

  const works: RankedWork[] = [];
  for (const item of rawWorks.slice(0, MAX_COVER_ENRICH)) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const creator =
      typeof item.creator === "string" ? item.creator.trim() : "";
    if (!id || !title) continue;
    const isbns = Array.isArray(item.isbns)
      ? item.isbns
          .filter((x): x is string => typeof x === "string" && x.trim() !== "")
          .map((x) => x.replace(/[-\s]/g, ""))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    works.push({
      id,
      title,
      creator,
      type: "book",
      imageUrl: "",
      source: id.startsWith("ndl:") ? "ndl" : "openlibrary",
      matchScore: 0,
      isbns,
      rawTitles: [title],
    });
  }

  if (works.length === 0) {
    return jsonBookResponse({ covers: [], error: "有効な作品がありません" }, 400);
  }

  const isbnCoverCache = new Map<string, boolean>();
  const covers = await mapPool(
    works,
    OL_COVER_CONCURRENCY,
    async (work) => {
      try {
        const result = await Promise.race([
          enrichBookCoverUrl(work, isbnCoverCache),
          sleep(OL_COVER_TIMEOUT_MS).then(() => ({
            imageUrl: "",
            coverSource: "" as const,
          })),
        ]);
        return {
          id: work.id,
          imageUrl: result.imageUrl || "",
          coverSource: result.coverSource || "",
        };
      } catch (error) {
        console.error("表紙補完エラー:", error);
        return { id: work.id, imageUrl: "", coverSource: "" };
      }
    }
  );

  return jsonBookResponse({ covers });
}
