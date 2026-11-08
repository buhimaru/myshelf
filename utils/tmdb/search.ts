import { tmdbGet, tmdbPosterUrl } from "./client";
import {
  emptyTmdbCredit,
  fetchMovieDirectorCredit,
  type TmdbCreditRole,
} from "./credits";
import {
  anyTitleMatchesCompact,
  buildCandidatePrefixQuery,
  buildNotationRetryQueries,
  compactTitleKey,
} from "../searchNotation";

/** myshelf の既存カテゴリに対応（スキーマは変更しない） */
export type TmdbShelfKind = "movie" | "anime" | "drama";

export type TmdbSearchHit = {
  id: string;
  title: string;
  creator: string;
  type: TmdbShelfKind;
  imageUrl: string;
  subtitle: string;
  /** 画面表示用。DBには保存しない（スキーマに外部ID欄なし） */
  tmdbId: number;
  media: "movie" | "tv";
  year: string;
  /** 検索UI用。保存時は creator 文字列のみ使う */
  creatorRole?: TmdbCreditRole | "";
  creatorRoleLabel?: string;
};

type TmdbMovieResult = {
  id?: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  original_language?: string;
  popularity?: number;
  overview?: string;
};

type TmdbTvResult = {
  id?: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  original_language?: string;
  popularity?: number;
  overview?: string;
};

type SearchPage<T> = {
  results?: T[];
};

/** TMDb の Animation ジャンル ID（movie / tv 共通） */
const ANIMATION_GENRE_ID = 16;
const RESULT_LIMIT = 20;

function yearFromDate(value: string | undefined): string {
  if (!value || value.length < 4) return "";
  const year = value.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitle(title: string, original: string, query: string): number {
  const q = normalize(query);
  const t = normalize(title);
  const o = normalize(original);
  if (!q) return 0;
  let score = 0;
  if (t === q || o === q) score += 200;
  else if (t.startsWith(q) || o.startsWith(q)) score += 100;
  else if (t.includes(q) || o.includes(q)) score += 40;
  // 中黒・空白を無視した一致（ゲームオブスローンズ ↔ ゲーム・オブ・スローンズ）
  const cq = compactTitleKey(query);
  if (cq) {
    if (compactTitleKey(title) === cq || compactTitleKey(original) === cq) {
      score = Math.max(score, 190);
    }
  }
  return score;
}

function isAnimation(genreIds: number[] | undefined): boolean {
  return Array.isArray(genreIds) && genreIds.includes(ANIMATION_GENRE_ID);
}

function mapMovie(
  row: TmdbMovieResult,
  shelfType: TmdbShelfKind
): TmdbSearchHit | null {
  const id = typeof row.id === "number" ? row.id : null;
  const title = (row.title || row.original_title || "").trim();
  if (id === null || !title) return null;
  const year = yearFromDate(row.release_date);
  const mediaLabel = "映画";
  return {
    id: `tmdb:movie:${id}`,
    title,
    creator: "",
    type: shelfType,
    imageUrl: tmdbPosterUrl(row.poster_path),
    subtitle: [year, mediaLabel].filter(Boolean).join(" · "),
    tmdbId: id,
    media: "movie",
    year,
    creatorRole: "",
    creatorRoleLabel: "",
  };
}

function mapTv(
  row: TmdbTvResult,
  shelfType: TmdbShelfKind
): TmdbSearchHit | null {
  const id = typeof row.id === "number" ? row.id : null;
  const title = (row.name || row.original_name || "").trim();
  if (id === null || !title) return null;
  const year = yearFromDate(row.first_air_date);
  const mediaLabel = "TV";
  return {
    id: `tmdb:tv:${id}`,
    title,
    creator: "",
    type: shelfType,
    imageUrl: tmdbPosterUrl(row.poster_path),
    subtitle: [year, mediaLabel].filter(Boolean).join(" · "),
    tmdbId: id,
    media: "tv",
    year,
    creatorRole: "",
    creatorRoleLabel: "",
  };
}

async function searchMovies(query: string): Promise<TmdbMovieResult[]> {
  const result = await tmdbGet<SearchPage<TmdbMovieResult>>("search/movie", {
    query,
    language: "ja-JP",
    include_adult: "false",
    page: 1,
  });
  if (!result.ok) {
    throw Object.assign(result.error, { status: result.status });
  }
  return Array.isArray(result.data.results) ? result.data.results : [];
}

async function searchTv(query: string): Promise<TmdbTvResult[]> {
  const result = await tmdbGet<SearchPage<TmdbTvResult>>("search/tv", {
    query,
    language: "ja-JP",
    include_adult: "false",
    page: 1,
  });
  if (!result.ok) {
    throw Object.assign(result.error, { status: result.status });
  }
  return Array.isArray(result.data.results) ? result.data.results : [];
}

function movieMatchesQuery(row: TmdbMovieResult, query: string): boolean {
  return anyTitleMatchesCompact([row.title, row.original_title], query);
}

function tvMatchesQuery(row: TmdbTvResult, query: string): boolean {
  return anyTitleMatchesCompact([row.name, row.original_name], query);
}

/**
 * 通常検索を優先。
 * 0件、または compact 一致が1件もないときだけ表記ゆれ再試行（最大2回）→ prefix。
 */
async function searchWithNotationFallback<T>(
  search: (q: string) => Promise<T[]>,
  query: string,
  matches: (row: T, query: string) => boolean
): Promise<T[]> {
  const primary = await search(query);
  const primaryMatched = primary.filter((row) => matches(row, query));
  // 原文ヒットがあり、かつ表記ゆれ無視で一致するものがあれば原文結果を使う
  if (primary.length > 0 && primaryMatched.length > 0) return primary;

  for (const retry of buildNotationRetryQueries(query, 2)) {
    const rows = await search(retry);
    const matched = rows.filter((row) => matches(row, query));
    if (matched.length > 0) return matched;
  }

  const prefix = buildCandidatePrefixQuery(query);
  if (prefix) {
    const prefixRows = await search(prefix);
    const matched = prefixRows.filter((row) => matches(row, query));
    if (matched.length > 0) return matched;
  }

  return primary;
}

async function searchMoviesWithNotationFallback(
  query: string
): Promise<TmdbMovieResult[]> {
  return searchWithNotationFallback(searchMovies, query, movieMatchesQuery);
}

async function searchTvWithNotationFallback(
  query: string
): Promise<TmdbTvResult[]> {
  return searchWithNotationFallback(searchTv, query, tvMatchesQuery);
}

/** アニメ用: 映画・TVともヒットが弱いときだけ表記ゆれ再試行 */
async function searchAnimeSourcesWithNotationFallback(
  query: string
): Promise<{ movies: TmdbMovieResult[]; shows: TmdbTvResult[] }> {
  let [movies, shows] = await Promise.all([
    searchMovies(query),
    searchTv(query),
  ]);
  const hasCompact =
    movies.some((row) => movieMatchesQuery(row, query)) ||
    shows.some((row) => tvMatchesQuery(row, query));
  if ((movies.length > 0 || shows.length > 0) && hasCompact) {
    return { movies, shows };
  }

  const primaryMovies = movies;
  const primaryShows = shows;

  for (const retry of buildNotationRetryQueries(query, 2)) {
    [movies, shows] = await Promise.all([
      searchMovies(retry),
      searchTv(retry),
    ]);
    movies = movies.filter((row) => movieMatchesQuery(row, query));
    shows = shows.filter((row) => tvMatchesQuery(row, query));
    if (movies.length > 0 || shows.length > 0) {
      return { movies, shows };
    }
  }

  const prefix = buildCandidatePrefixQuery(query);
  if (prefix) {
    [movies, shows] = await Promise.all([
      searchMovies(prefix),
      searchTv(prefix),
    ]);
    movies = movies.filter((row) => movieMatchesQuery(row, query));
    shows = shows.filter((row) => tvMatchesQuery(row, query));
    if (movies.length > 0 || shows.length > 0) {
      return { movies, shows };
    }
  }

  return { movies: primaryMovies, shows: primaryShows };
}

/** 映画（アニメ映画含む）に監督名を付与。失敗時は空のまま */
async function enrichMovieDirectors(
  hits: TmdbSearchHit[]
): Promise<TmdbSearchHit[]> {
  return Promise.all(
    hits.map(async (hit) => {
      if (hit.media !== "movie") return hit;
      try {
        const credit = await fetchMovieDirectorCredit(hit.tmdbId);
        if (!credit.creator) {
          return {
            ...hit,
            creator: "",
            creatorRole: "",
            creatorRoleLabel: "",
          };
        }
        return {
          ...hit,
          creator: credit.creator,
          creatorRole: credit.role,
          creatorRoleLabel: credit.roleLabel,
        };
      } catch {
        const empty = emptyTmdbCredit();
        return {
          ...hit,
          creator: empty.creator,
          creatorRole: empty.role,
          creatorRoleLabel: empty.roleLabel,
        };
      }
    })
  );
}

export async function searchTmdbForShelf(
  kind: TmdbShelfKind,
  query: string
): Promise<TmdbSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  if (kind === "movie") {
    const rows = await searchMoviesWithNotationFallback(q);
    const scored = rows
      .map((row) => {
        const hit = mapMovie(row, "movie");
        if (!hit) return null;
        const score =
          scoreTitle(hit.title, row.original_title || "", q) +
          (row.popularity ?? 0) * 0.01;
        return { hit, score };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.score - a.score);
    const hits = scored.slice(0, RESULT_LIMIT).map((row) => row.hit);
    return enrichMovieDirectors(hits);
  }

  if (kind === "drama") {
    const rows = await searchTvWithNotationFallback(q);
    const scored = rows
      .map((row) => {
        const hit = mapTv(row, "drama");
        if (!hit) return null;
        // ドラマ検索ではアニメを下げ、実写TVを優先
        const animPenalty = isAnimation(row.genre_ids) ? -80 : 0;
        const score =
          scoreTitle(hit.title, row.original_name || "", q) +
          animPenalty +
          (row.popularity ?? 0) * 0.01;
        return { hit, score };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, RESULT_LIMIT).map((row) => row.hit);
  }

  // anime: 映画・TVの双方から Animation を優先して収集
  const { movies, shows } = await searchAnimeSourcesWithNotationFallback(q);

  const scored: Array<{ hit: TmdbSearchHit; score: number }> = [];

  for (const row of movies) {
    const hit = mapMovie(row, "anime");
    if (!hit) continue;
    const anim = isAnimation(row.genre_ids);
    const ja = row.original_language === "ja";
    if (!anim && !ja) continue;
    const score =
      scoreTitle(hit.title, row.original_title || "", q) +
      (anim ? 120 : 20) +
      (ja ? 30 : 0) +
      (row.popularity ?? 0) * 0.01;
    scored.push({ hit, score });
  }

  for (const row of shows) {
    const hit = mapTv(row, "anime");
    if (!hit) continue;
    const anim = isAnimation(row.genre_ids);
    const ja = row.original_language === "ja";
    if (!anim && !ja) continue;
    const score =
      scoreTitle(hit.title, row.original_name || "", q) +
      (anim ? 140 : 10) +
      (ja ? 30 : 0) +
      (row.popularity ?? 0) * 0.01;
    scored.push({ hit, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const byId = new Map<string, TmdbSearchHit>();
  for (const row of scored) {
    if (byId.has(row.hit.id)) continue;
    byId.set(row.hit.id, row.hit);
    if (byId.size >= RESULT_LIMIT) break;
  }
  const hits = Array.from(byId.values());
  // アニメ映画のみ監督を付与（TVはシーズン選択時に詳細取得）
  return enrichMovieDirectors(hits);
}
