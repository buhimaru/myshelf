import { NextResponse } from "next/server";
import { lookupItunesArtworkFallbacks } from "../../../utils/itunes/musicCoverFallback";
import {
  buildNotationRetryQueries,
  compactTitleKey,
} from "../../../utils/searchNotation";

type MusicBrainzReleaseGroup = {
  id: string;
  title?: string;
  score?: number;
  "artist-credit"?: Array<{ name?: string }>;
};

type MusicBrainzRecordingRelease = {
  id?: string;
  title?: string;
  date?: string;
  country?: string;
  "release-group"?: {
    id?: string;
    title?: string;
    "primary-type"?: string;
    "secondary-types"?: string[];
  };
};

type MusicBrainzRecording = {
  id: string;
  title?: string;
  score?: number;
  disambiguation?: string;
  "artist-credit"?: Array<{ name?: string }>;
  releases?: MusicBrainzRecordingRelease[];
};

type MusicResult = {
  id: string;
  title: string;
  creator: string;
  type: "music";
  imageUrl: string;
  /** 楽曲の区別表示。作品名には含めない */
  subtitle?: string;
  /**
   * ジャケット候補。Cover Art Archive を先に、続けて iTunes フォールバック。
   * クライアントは読み込み失敗時に次候補へ進む。
   */
  imageCandidates?: string[];
};

const USER_AGENT = "myshelf/1.0 (https://github.com/buhimaru/myshelf)";

// MusicBrainz は平均1リクエスト/秒。開始間隔を空け、同時実行もしない。
const MB_MIN_INTERVAL_MS = 1100;
const MB_TIMEOUT_MS = 6000;
const MB_MAX_RETRIES = 2;
const PAGE_SIZE = 20;
const MAX_OFFSET = 1000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

type MusicKind = "all" | "album" | "single" | "song";

type MusicSearchPayload = {
  results: MusicResult[];
  nextOffset: number | null;
  totalCount: number;
};

const searchCache = new Map<string, { expiresAt: number; payload: MusicSearchPayload }>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestGate(minIntervalMs: number) {
  let tail: Promise<void> = Promise.resolve();
  let lastStartedAt = 0;

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    const previous = tail;
    let release: () => void = () => {};
    tail = new Promise((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      const wait = minIntervalMs - (Date.now() - lastStartedAt);
      if (wait > 0) await sleep(wait);
      lastStartedAt = Date.now();
      return await task();
    } finally {
      release();
    }
  };
}

const withMusicBrainz = createRequestGate(MB_MIN_INTERVAL_MS);

function readSearchCache(key: string): MusicSearchPayload | null {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  searchCache.delete(key);
  searchCache.set(key, hit);
  return hit.payload;
}

function writeSearchCache(key: string, payload: MusicSearchPayload) {
  searchCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  while (searchCache.size > CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest === undefined) break;
    searchCache.delete(oldest);
  }
}

class RetryableStatusError extends Error {
  constructor(readonly status: number) {
    super(`retryable status ${status}`);
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableStatusError) {
    return error.status === 429 || error.status >= 500;
  }
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function cleanSearchText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function resultMatchesSearch(
  result: Pick<MusicResult, "title" | "creator">,
  title: string,
  artist: string
): boolean {
  if (title) {
    if (compactTitleKey(result.title) !== compactTitleKey(title)) return false;
  }
  if (artist) {
    const want = compactTitleKey(artist);
    const got = compactTitleKey(result.creator);
    if (!got.includes(want) && !want.includes(got)) return false;
  }
  return true;
}

function escapeLucene(value: string): string {
  return value.replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, "\\$1");
}

function parseKind(value: string | null): MusicKind | null {
  if (!value || value === "all") return "all";
  if (value === "album" || value === "single" || value === "song") return value;
  return null;
}

function parseOffset(value: string | null): number | null {
  if (!value) return 0;
  if (!/^\d+$/.test(value)) return null;
  const offset = Number(value);
  if (offset > MAX_OFFSET) return null;
  return offset;
}

function buildReleaseGroupQuery(title: string, artist: string, kind: MusicKind): string {
  const parts: string[] = [];
  if (title) parts.push(`releasegroup:"${escapeLucene(title)}"`);
  if (artist) parts.push(`artist:"${escapeLucene(artist)}"`);
  if (kind === "album") parts.push("primarytype:album");
  else if (kind === "single") parts.push("primarytype:single");
  else parts.push("(primarytype:album OR primarytype:single OR primarytype:ep)");
  return parts.join(" AND ");
}

function buildRecordingQuery(title: string, artist: string): string {
  const parts: string[] = [];
  if (title) parts.push(`recording:"${escapeLucene(title)}"`);
  if (artist) parts.push(`artist:"${escapeLucene(artist)}"`);
  return parts.join(" AND ");
}

function coverUrlForReleaseGroup(id: string): string {
  return `https://coverartarchive.org/release-group/${id}/front-250`;
}

/** YYYY / YYYY-MM / YYYY-MM-DD を比較用の日数に。不明は null */
function parseReleaseDate(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

/**
 * recording に埋め込まれた releases だけから、release-group ごとの最古日を取る。
 * 日付が分かる RG を古い順に並べ、日付不明は後ろへ。
 */
function imageCandidatesFromReleases(
  releases: MusicBrainzRecordingRelease[] | undefined
): string[] {
  if (!releases || releases.length === 0) return [];

  const byGroup = new Map<string, number | null>();
  for (const release of releases) {
    const groupId = release["release-group"]?.id;
    if (!groupId) continue;
    const date = parseReleaseDate(release.date);
    const previous = byGroup.get(groupId);
    if (previous === undefined) {
      byGroup.set(groupId, date);
      continue;
    }
    if (date === null) continue;
    if (previous === null || date < previous) byGroup.set(groupId, date);
  }

  return [...byGroup.entries()]
    .sort((a, b) => {
      const dateA = a[1];
      const dateB = b[1];
      if (dateA === null && dateB === null) return a[0].localeCompare(b[0]);
      if (dateA === null) return 1;
      if (dateB === null) return -1;
      if (dateA !== dateB) return dateA - dateB;
      return a[0].localeCompare(b[0]);
    })
    .map(([groupId]) => coverUrlForReleaseGroup(groupId));
}

async function musicBrainzJson<T>(url: URL): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MB_MAX_RETRIES; attempt++) {
    try {
      return await withMusicBrainz(async () => {
        const response = await fetch(url, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(MB_TIMEOUT_MS),
        });

        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          throw new RetryableStatusError(response.status);
        }

        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`MusicBrainz API error: ${response.status}`);
        }

        return (await response.json()) as T;
      });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MB_MAX_RETRIES) throw error;
    }
  }

  throw lastError;
}

async function searchReleaseGroups(
  query: string,
  offset: number
): Promise<{ groups: MusicBrainzReleaseGroup[]; totalCount: number }> {
  const url = new URL("https://musicbrainz.org/ws/2/release-group/");
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const data = await musicBrainzJson<{
    count?: number;
    "release-groups"?: MusicBrainzReleaseGroup[];
  }>(url);

  return {
    groups: data["release-groups"] ?? [],
    totalCount: data.count ?? 0,
  };
}

async function searchRecordings(
  query: string,
  offset: number
): Promise<{ recordings: MusicBrainzRecording[]; totalCount: number }> {
  const url = new URL("https://musicbrainz.org/ws/2/recording/");
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const data = await musicBrainzJson<{
    count?: number;
    recordings?: MusicBrainzRecording[];
  }>(url);

  return {
    recordings: data.recordings ?? [],
    totalCount: data.count ?? 0,
  };
}

function toAlbumResults(groups: MusicBrainzReleaseGroup[]): MusicResult[] {
  const seen = new Set<string>();
  const results: MusicResult[] = [];

  for (const album of groups) {
    if (!album.id || seen.has(album.id)) continue;
    seen.add(album.id);
    const caaUrl = coverUrlForReleaseGroup(album.id);
    results.push({
      id: album.id,
      title: album.title ?? "",
      creator: album["artist-credit"]?.[0]?.name ?? "",
      type: "music",
      imageUrl: caaUrl,
      imageCandidates: [caaUrl],
    });
  }

  return results;
}

function toSongResults(recordings: MusicBrainzRecording[]): MusicResult[] {
  const seen = new Set<string>();
  const results: MusicResult[] = [];

  for (const recording of recordings) {
    if (!recording.id || seen.has(recording.id)) continue;
    seen.add(recording.id);
    const candidates = imageCandidatesFromReleases(recording.releases);
    const subtitle = (recording.disambiguation ?? "").trim();
    results.push({
      id: recording.id,
      title: recording.title ?? "",
      creator: recording["artist-credit"]?.[0]?.name ?? "",
      type: "music",
      imageUrl: candidates[0] ?? "",
      ...(subtitle ? { subtitle } : {}),
      ...(candidates.length > 0 ? { imageCandidates: candidates } : {}),
    });
  }

  return results;
}

function mergeItunesFallbacks(
  results: MusicResult[],
  itunesById: Map<string, string>
): MusicResult[] {
  if (itunesById.size === 0) return results;
  return results.map((result) => {
    const itunesUrl = itunesById.get(result.id);
    if (!itunesUrl) return result;
    const existing = Array.isArray(result.imageCandidates)
      ? result.imageCandidates.filter((url) => url.trim() !== "")
      : result.imageUrl.trim()
        ? [result.imageUrl.trim()]
        : [];
    if (existing.includes(itunesUrl)) {
      return {
        ...result,
        imageUrl: existing[0] ?? itunesUrl,
        imageCandidates: existing,
      };
    }
    const candidates = [...existing, itunesUrl];
    return {
      ...result,
      imageUrl: candidates[0] ?? "",
      imageCandidates: candidates,
    };
  });
}

async function withItunesFallbacks(
  results: MusicResult[],
  kind: MusicKind,
  searchTitle: string,
  searchArtist: string
): Promise<MusicResult[]> {
  if (results.length === 0) return results;
  try {
    const itunesById = await lookupItunesArtworkFallbacks({
      results,
      kind,
      searchTitle,
      searchArtist,
    });
    return mergeItunesFallbacks(results, itunesById);
  } catch (error) {
    console.error("iTunes ジャケット補完エラー:", error);
    return results;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = cleanSearchText(searchParams.get("title") ?? "");
  const artist = cleanSearchText(searchParams.get("artist") ?? "");
  const legacyQuery = cleanSearchText(searchParams.get("q") ?? "");
  const workTitle = title || (artist ? "" : legacyQuery);
  const kind = parseKind(searchParams.get("kind"));
  const offset = parseOffset(searchParams.get("offset"));

  if (!workTitle && !artist) {
    return NextResponse.json(
      { results: [], error: "作品名かアーティスト名が必要です" },
      { status: 400 }
    );
  }

  if (!kind || offset === null) {
    return NextResponse.json(
      { results: [], error: "検索条件が不正です" },
      { status: 400 }
    );
  }

  // v4: タイトル空白ゆれの再検索 + CAA/iTunes imageCandidates
  const cacheKey = JSON.stringify({
    v: 4,
    workTitle,
    artist,
    kind,
    offset,
  });
  const cached = readSearchCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const titleRetries = buildNotationRetryQueries(workTitle, 2);
    let pageLength = 0;
    let totalCount = 0;
    let baseResults: MusicResult[] = [];
    let usedAlternate = false;

    if (kind === "song") {
      let found = await searchRecordings(
        buildRecordingQuery(workTitle, artist),
        offset
      );
      pageLength = found.recordings.length;
      totalCount = found.totalCount;
      baseResults = toSongResults(found.recordings);

      if (baseResults.length === 0) {
        for (const altTitle of titleRetries) {
          found = await searchRecordings(
            buildRecordingQuery(altTitle, artist),
            offset
          );
          pageLength = found.recordings.length;
          totalCount = found.totalCount;
          baseResults = toSongResults(found.recordings).filter((row) =>
            resultMatchesSearch(row, workTitle, artist)
          );
          usedAlternate = true;
          if (baseResults.length > 0) break;
        }
      }
    } else {
      let found = await searchReleaseGroups(
        buildReleaseGroupQuery(workTitle, artist, kind),
        offset
      );
      pageLength = found.groups.length;
      totalCount = found.totalCount;
      baseResults = toAlbumResults(found.groups);

      if (baseResults.length === 0) {
        for (const altTitle of titleRetries) {
          found = await searchReleaseGroups(
            buildReleaseGroupQuery(altTitle, artist, kind),
            offset
          );
          pageLength = found.groups.length;
          totalCount = found.totalCount;
          baseResults = toAlbumResults(found.groups).filter((row) =>
            resultMatchesSearch(row, workTitle, artist)
          );
          usedAlternate = true;
          if (baseResults.length > 0) break;
        }
      }
    }

    const results = await withItunesFallbacks(
      baseResults,
      kind,
      workTitle,
      artist
    );
    const nextOffset =
      results.length > 0 && offset + pageLength < totalCount
        ? offset + pageLength
        : null;
    const payload: MusicSearchPayload = {
      results,
      nextOffset,
      totalCount: usedAlternate
        ? Math.max(totalCount, results.length)
        : totalCount,
    };
    writeSearchCache(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("音楽検索エラー:", error);

    return NextResponse.json(
      { results: [], error: "音楽検索に失敗しました" },
      { status: 502 }
    );
  }
}
