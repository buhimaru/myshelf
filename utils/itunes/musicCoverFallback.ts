/**
 * MusicBrainz / Cover Art Archive 失敗時のジャケット補完（iTunes Search API）。
 * 作品検索そのものは MusicBrainz のまま。厳密一致時のみ URL を返す。
 *
 * 注意: Apple の Promo Content 条項ではジャケット利用にストア誘導バッジ近接などが求められる。
 * ここでは同一作品の識別用フォールバックとして artwork URL のみ参照する。
 */

export type ItunesCoverKind = "album" | "single" | "song" | "all";

type ItunesSearchResult = {
  wrapperType?: string;
  collectionType?: string;
  artistName?: string;
  collectionName?: string;
  trackName?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
};

type CacheEntry = {
  expiresAt: number;
  items: ItunesSearchResult[];
};

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const FETCH_TIMEOUT_MS = 2800;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 80;
const SEARCH_LIMIT = 25;

/** 別作品・別テイクとみなす（一致させない） */
const HARD_VERSION_MARKERS = [
  "live",
  "remix",
  "cover",
  "covers",
  "karaoke",
  "instrumental",
  "acoustic",
  "demo",
  "from the first take",
  "the first take",
  "tribute",
  "ライブ",
  "リミックス",
  "カバー",
  "カラオケ",
  "インスト",
  "アコースティック",
] as const;

/** 同一作品の再発・リマスター等。アルバム照合では許容し、シングルでは拒否 */
const SOFT_VERSION_MARKERS = [
  "remaster",
  "remastered",
  "mix",
  "deluxe",
  "anniversary",
  "edition",
  "super deluxe",
  "edit",
] as const;

const searchCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ItunesSearchResult[]>>();

function normalizeKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[「」『』【】〔〕［\]\[\]()（）"'“”‘’]/g, " ")
    .replace(/[・･/／∶:：、，,._\-–—~〜]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKey(value: string): string {
  return normalizeKey(value).replace(/\s+/g, "");
}

function extractMarkers(
  value: string,
  markers: readonly string[]
): Set<string> {
  const normalized = normalizeKey(value);
  const found = new Set<string>();
  for (const marker of markers) {
    if (normalized.includes(marker)) found.add(marker);
  }
  return found;
}

/** iTunes 側にだけ付いている別バージョン標識があれば拒否 */
function hasUnexpectedVersion(
  mbTitle: string,
  itunesTitle: string,
  kind: ItunesCoverKind
): boolean {
  const mbHard = extractMarkers(mbTitle, HARD_VERSION_MARKERS);
  const itHard = extractMarkers(itunesTitle, HARD_VERSION_MARKERS);
  for (const marker of itHard) {
    if (!mbHard.has(marker)) return true;
  }

  // シングルはリマスター／Mix 単独発売を元シングルへ流用しない
  if (kind === "single" || kind === "song") {
    const mbSoft = extractMarkers(mbTitle, SOFT_VERSION_MARKERS);
    const itSoft = extractMarkers(itunesTitle, SOFT_VERSION_MARKERS);
    for (const marker of itSoft) {
      if (!mbSoft.has(marker)) return true;
    }
  }
  return false;
}

function artistsMatch(mbArtist: string, itunesArtist: string): boolean {
  const a = compactKey(mbArtist);
  const b = compactKey(itunesArtist);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * 題名の一致。完全一致、または「First Love / 初恋」と「First Love」のような
 * 先頭一致・スラッシュ分割一致を許容。別バージョンは別関数で弾く。
 */
function titlesMatch(mbTitle: string, itunesTitle: string): boolean {
  const a = normalizeKey(mbTitle);
  const b = normalizeKey(itunesTitle);
  if (!a || !b) return false;
  if (a === b) return true;

  const aParts = a.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  const bParts = b.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  for (const ap of aParts) {
    for (const bp of bParts) {
      if (ap === bp && ap.length >= 2) return true;
    }
  }

  const ac = compactKey(mbTitle);
  const bc = compactKey(itunesTitle);
  if (ac === bc) return true;
  if (ac.length >= 4 && bc.length >= 4) {
    if (ac.startsWith(bc) || bc.startsWith(ac)) return true;
  }
  return false;
}

function enlargeArtworkUrl(url: string): string {
  return url.replace(/100x100bb/i, "600x600bb").replace(/60x60bb/i, "600x600bb");
}

function pickArtworkUrl(item: ItunesSearchResult): string | null {
  const raw = (item.artworkUrl100 || item.artworkUrl60 || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return enlargeArtworkUrl(raw);
}

/**
 * iTunes は Single/EP でも collectionType が Album のことが多い。
 * 名称末尾の " - Single" / " - EP" も見て形態を推定する。
 */
function inferReleaseForm(
  item: ItunesSearchResult
): "album" | "single" | "ep" | "unknown" {
  const declared = (item.collectionType ?? "").trim().toLowerCase();
  if (declared === "single") return "single";
  if (declared === "ep") return "ep";

  const name = normalizeKey(item.collectionName ?? "");
  if (!name) return declared === "album" ? "album" : "unknown";
  if (/(?:^|\s)-\s*single$/.test(name) || /\bsingle$/.test(name)) {
    return "single";
  }
  if (/(?:^|\s)-\s*ep$/.test(name) || /\bep$/.test(name)) return "ep";
  if (declared === "album") return "album";
  return "unknown";
}

/** 照合用に Single/EP 接尾辞を除いた題名 */
function stripReleaseFormSuffix(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s*-\s*Single\s*$/i, "")
    .replace(/\s*-\s*EP\s*$/i, "")
    .replace(/\s+Single\s*$/i, "")
    .replace(/\s+EP\s*$/i, "")
    .trim();
}

function scoreMatch(
  mbTitle: string,
  mbArtist: string,
  kind: ItunesCoverKind,
  item: ItunesSearchResult
): number {
  const rawItunesTitle =
    kind === "song"
      ? (item.trackName ?? item.collectionName ?? "")
      : (item.collectionName ?? item.trackName ?? "");
  const itunesTitle = stripReleaseFormSuffix(rawItunesTitle);
  const itunesArtist = item.artistName ?? "";

  if (!artistsMatch(mbArtist, itunesArtist)) return -1;
  if (!titlesMatch(mbTitle, itunesTitle)) return -1;
  if (hasUnexpectedVersion(mbTitle, itunesTitle, kind)) return -1;
  if (hasUnexpectedVersion(mbTitle, rawItunesTitle, kind)) return -1;

  const form = inferReleaseForm(item);
  if (kind === "album") {
    if (form === "single" || form === "ep") return -1;
  } else if (kind === "single") {
    if (form === "album") return -1;
  } else if (kind === "song") {
    if ((item.wrapperType ?? "").toLowerCase() === "collection") return -1;
  }

  let score = 10;
  if (normalizeKey(mbTitle) === normalizeKey(itunesTitle)) score += 8;
  if (compactKey(mbArtist) === compactKey(itunesArtist)) score += 4;
  if (kind === "single" && form === "single") score += 3;
  if (kind === "single" && form === "ep") score += 1;
  if (kind === "album" && form === "album") score += 3;
  if (kind === "song" && (item.trackName ?? "")) score += 2;
  return score;
}

function readCache(key: string): ItunesSearchResult[] | null {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  searchCache.delete(key);
  searchCache.set(key, hit);
  return hit.items;
}

function writeCache(key: string, items: ItunesSearchResult[]) {
  searchCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, items });
  while (searchCache.size > CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest === undefined) break;
    searchCache.delete(oldest);
  }
}

async function fetchItunesSearch(
  term: string,
  kind: ItunesCoverKind,
  country: "jp" | "us"
): Promise<ItunesSearchResult[]> {
  const entity = kind === "song" ? "song" : "album";
  const cacheKey = JSON.stringify({ term, entity, country });
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const task = (async () => {
    const url = new URL(ITUNES_SEARCH_URL);
    url.searchParams.set("term", term);
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", entity);
    url.searchParams.set("limit", String(SEARCH_LIMIT));
    url.searchParams.set("country", country);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        writeCache(cacheKey, []);
        return [];
      }
      const data = (await response.json()) as { results?: ItunesSearchResult[] };
      const items = Array.isArray(data.results) ? data.results : [];
      writeCache(cacheKey, items);
      return items;
    } catch {
      writeCache(cacheKey, []);
      return [];
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, task);
  return task;
}

function dedupeItunesResults(
  items: ItunesSearchResult[]
): ItunesSearchResult[] {
  const seen = new Set<string>();
  const out: ItunesSearchResult[] = [];
  for (const item of items) {
    const key = [
      item.wrapperType ?? "",
      item.collectionName ?? "",
      item.trackName ?? "",
      item.artistName ?? "",
      item.artworkUrl100 ?? "",
    ].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * 1回の iTunes 検索結果から、MB 作品に対する自信のあるジャケット URL を返す。
 * 判定できない場合は null（無理に付けない）。
 */
export function pickItunesArtworkUrl(params: {
  title: string;
  artist: string;
  kind: ItunesCoverKind;
  itunesResults: ItunesSearchResult[];
}): string | null {
  const title = params.title.trim();
  const artist = params.artist.trim();
  if (!title || !artist || params.itunesResults.length === 0) return null;

  let best: { score: number; url: string } | null = null;
  for (const item of params.itunesResults) {
    const score = scoreMatch(title, artist, params.kind, item);
    if (score < 0) continue;
    const url = pickArtworkUrl(item);
    if (!url) continue;
    if (!best || score > best.score) best = { score, url };
  }
  // 十分な一致のみ（タイトル+アーティスト一致で最低 10）
  if (!best || best.score < 12) return null;
  return best.url;
}

/**
 * ページ単位で iTunes を1回引き、各 MB 結果へフォールバック URL を割り当てる。
 * 失敗・タイムアウト時は空 Map（CAA のみのまま）。
 */
export async function lookupItunesArtworkFallbacks(params: {
  results: Array<{ id: string; title: string; creator: string }>;
  kind: ItunesCoverKind;
  searchTitle: string;
  searchArtist: string;
}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (params.results.length === 0) return out;

  const term = [params.searchArtist, params.searchTitle]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!term) return out;

  const kindForSearch: ItunesCoverKind =
    params.kind === "all" ? "album" : params.kind;
  // JP/US を並列取得（表記ゆれ: 宇多田ヒカル / Hikaru Utada、ビートルズ / The Beatles）
  const [jpResults, usResults] = await Promise.all([
    fetchItunesSearch(term, kindForSearch, "jp"),
    fetchItunesSearch(term, kindForSearch, "us"),
  ]);
  const itunesResults = dedupeItunesResults([...jpResults, ...usResults]);
  if (itunesResults.length === 0) return out;

  for (const result of params.results) {
    const url = pickItunesArtworkUrl({
      title: result.title,
      artist: result.creator,
      kind: params.kind === "all" ? "album" : params.kind,
      itunesResults,
    });
    // kind=all のときは album で取れなければ single としても再評価
    if (!url && params.kind === "all") {
      const singleUrl = pickItunesArtworkUrl({
        title: result.title,
        artist: result.creator,
        kind: "single",
        itunesResults,
      });
      if (singleUrl) out.set(result.id, singleUrl);
      continue;
    }
    if (url) out.set(result.id, url);
  }

  return out;
}
