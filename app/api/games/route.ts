import { NextResponse } from "next/server";
import {
  escapeApicalypseString,
  hasIgdbCredentials,
  igdbPost,
} from "../../../utils/igdb/client";
import {
  NOISY_GAME_TYPE_NAMES,
  PREFERRED_GAME_TYPE_NAMES,
  resolveGameTypeName,
  resolveGameTypeNameById,
  resolveJapanRegionId,
} from "../../../utils/igdb/meta";
import {
  buildCandidatePrefixQuery,
  buildNotationRetryQueries,
  titlesMatchCompact,
} from "../../../utils/searchNotation";

type GameResult = {
  id: string;
  title: string;
  creator: string;
  type: "game";
  imageUrl: string;
};

type IgdbCover = {
  image_id?: unknown;
  url?: unknown;
};

type IgdbLocalization = {
  name?: unknown;
  region?: unknown;
  cover?: IgdbCover;
};

type IgdbAlternativeName = {
  name?: unknown;
  comment?: unknown;
};

type IgdbCompanyRef = {
  developer?: unknown;
  publisher?: unknown;
  company?: { name?: unknown };
};

type IgdbGame = {
  id?: unknown;
  name?: unknown;
  cover?: IgdbCover;
  version_parent?: unknown;
  game_type?: unknown;
  first_release_date?: unknown;
  game_localizations?: IgdbLocalization[];
  alternative_names?: IgdbAlternativeName[];
  involved_companies?: IgdbCompanyRef[];
  platforms?: Array<{ name?: unknown }>;
};

type IgdbLocalizationHit = {
  name?: unknown;
  region?: unknown;
  game?: unknown;
  cover?: IgdbCover | number;
};

const SEARCH_FETCH_LIMIT = 25;
/** 部分一致は多めに取り、題名近さで絞り込む（完全一致は別クエリ） */
const LOCALIZATION_FETCH_LIMIT = 80;
const LOCALIZATION_KEEP_LIMIT = 45;
const LOCALIZATION_EXACT_LIMIT = 20;
/** 1ページ分。もっと見るで次ページを返す */
const PAGE_SIZE = 20;
/** 順位付け後に保持する最大件数（この範囲をページング） */
const MAX_RANKED_POOL = 60;
const POOL_CACHE_TTL_MS = 120_000;
const POOL_CACHE_MAX = 40;
const MAX_OFFSET = 200;
const HAS_JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
/** ナンバリング続編の番号トークン（半角/全角/ローマ数字/漢数字） */
const NUMBER_TOKEN_RE =
  String.raw`(?:[0-9０-９]{1,2}|[ivxlcdmIVXLCDM]{1,4}|[一二三四五六七八九十]+)`;
/** クエリ＋番号（＋任意の副題）例: バイオハザード3 / バイオハザード3 ラストエスケープ */
const NUMBERED_SEQUEL_REST_RE = new RegExp(
  `^(${NUMBER_TOKEN_RE})(?:\\s+.*)?$`,
  "i"
);
const ENDS_WITH_NUMBER_RE = new RegExp(`${NUMBER_TOKEN_RE}$`, "i");

type TitleQueryRelation =
  | "exact"
  | "query-subtitle"
  | "numbered-sequel"
  | "prefix"
  | "contains"
  | "none";

/**
 * 題名とクエリの関係。
 * - numbered-sequel: 「シリーズ名 + 番号 + 任意副題」（LAST ESCAPE 等）
 * - query-subtitle: クエリ自体が番号付きで、題名に副題だけ付く場合
 */
function classifyTitleAgainstQuery(
  title: string,
  query: string
): TitleQueryRelation {
  const t = normalizeText(title);
  const q = normalizeText(query);
  if (!t || !q) return "none";
  if (t === q) return "exact";
  if (!t.startsWith(q)) {
    return t.includes(q) ? "contains" : "none";
  }
  const rest = t.slice(q.length).trim();
  if (!rest) return "exact";
  if (NUMBERED_SEQUEL_REST_RE.test(rest)) return "numbered-sequel";
  if (ENDS_WITH_NUMBER_RE.test(q)) return "query-subtitle";
  return "prefix";
}

const GAME_FIELDS = [
  "id",
  "name",
  "cover.image_id",
  "version_parent",
  "game_type",
  "game_type.type",
  "first_release_date",
  "game_localizations.name",
  "game_localizations.region",
  "game_localizations.cover.image_id",
  "alternative_names.name",
  "alternative_names.comment",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.company.name",
  "platforms.name",
].join(",");

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function hasJapaneseScript(value: string): boolean {
  return HAS_JAPANESE_RE.test(value);
}

function coverUrlFromImageId(imageId: string | null | undefined): string {
  if (!imageId) return "";
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

function pickJapanLocalization(
  locs: IgdbLocalization[] | undefined,
  japanRegionId: number | null
): IgdbLocalization | null {
  if (!locs?.length) return null;
  if (japanRegionId !== null) {
    const byRegion = locs.find(
      (loc) => asNumber(loc.region) === japanRegionId && asString(loc.name)
    );
    if (byRegion) return byRegion;
  }
  const byScript = locs.find((loc) => {
    const name = asString(loc.name);
    return name ? hasJapaneseScript(name) : false;
  });
  return byScript ?? null;
}

function pickJapaneseAlternativeName(
  alts: IgdbAlternativeName[] | undefined
): string | null {
  if (!alts?.length) return null;
  for (const alt of alts) {
    const name = asString(alt.name);
    if (name && hasJapaneseScript(name)) return name;
  }
  return null;
}

function pickTitle(
  game: IgdbGame,
  japanRegionId: number | null
): string {
  const jaLoc = pickJapanLocalization(game.game_localizations, japanRegionId);
  const jaLocName = asString(jaLoc?.name);
  if (jaLocName) return jaLocName;

  const altJa = pickJapaneseAlternativeName(game.alternative_names);
  if (altJa) return altJa;

  return asString(game.name) ?? "";
}

function pickImageUrl(
  game: IgdbGame,
  japanRegionId: number | null
): string {
  const jaLoc = pickJapanLocalization(game.game_localizations, japanRegionId);
  const jaCoverId = asString(jaLoc?.cover?.image_id);
  if (jaCoverId) return coverUrlFromImageId(jaCoverId);

  const coverId = asString(game.cover?.image_id);
  if (coverId) return coverUrlFromImageId(coverId);

  return "";
}

function pickCreator(game: IgdbGame): string {
  const companies = game.involved_companies ?? [];
  const developers = companies.filter((c) => c.developer === true);
  for (const entry of developers) {
    const name = asString(entry.company?.name);
    if (name) return name;
  }
  for (const entry of companies) {
    const name = asString(entry.company?.name);
    if (name) return name;
  }
  return "";
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function relationScore(relation: TitleQueryRelation): number {
  switch (relation) {
    case "exact":
      return 400;
    case "query-subtitle":
      return 360;
    case "numbered-sequel":
      return 280;
    case "prefix":
      return 120;
    case "contains":
      return 40;
    default:
      return 0;
  }
}

function bestTitleRelation(
  title: string,
  englishName: string,
  query: string
): TitleQueryRelation {
  const a = classifyTitleAgainstQuery(title, query);
  const b = classifyTitleAgainstQuery(englishName, query);
  const rank = (r: TitleQueryRelation) => relationScore(r);
  return rank(a) >= rank(b) ? a : b;
}

function scoreGame(title: string, englishName: string, query: string): number {
  const q = normalizeText(query);
  const t = normalizeText(title);
  const e = normalizeText(englishName);
  if (!q) return 0;

  const relation = bestTitleRelation(title, englishName, query);
  let score = relationScore(relation);

  // 番号続編・副題付き同一作以外の長い派生題名は下げる
  if (relation === "prefix" || relation === "contains") {
    const extra = Math.max(t.length, e.length) - q.length;
    if (extra >= 2) {
      score -= Math.min(120, extra * 8);
    }
  }

  for (const token of q.split(" ").filter((part) => part.length >= 2)) {
    if (t.includes(token) || e.includes(token)) score += 12;
  }

  return score;
}

/** 同点時は原作（Main Game）と古い発売を優先。リメイク等は別エントリとして残す */
function gameTypeSortRank(typeName: string | null): number {
  switch (typeName) {
    case "Main Game":
      return 0;
    case "Expanded Game":
      return 1;
    case "Remake":
      return 2;
    case "Remaster":
      return 3;
    case "Port":
      return 4;
    case "Standalone Expansion":
      return 5;
    case "Expansion":
      return 6;
    default:
      return 8;
  }
}

function filterAndRankGames(
  games: IgdbGame[],
  query: string,
  japanRegionId: number | null,
  typeNameById: Map<number, string>
): IgdbGame[] {
  const enriched = games
    .map((game) => {
      const id = asNumber(game.id);
      if (id === null) return null;
      const title = pickTitle(game, japanRegionId);
      if (!title) return null;
      const typeName = resolveGameTypeName(game.game_type, typeNameById);
      const release = asNumber(game.first_release_date) ?? Number.MAX_SAFE_INTEGER;
      return {
        game,
        id,
        title,
        typeName,
        release,
        versionParent: asNumber(game.version_parent),
        score: scoreGame(title, asString(game.name) ?? "", query),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const withoutEdition = enriched.filter((row) => row.versionParent === null);
  const editionPool = withoutEdition.length > 0 ? withoutEdition : enriched;

  const preferred = editionPool.filter(
    (row) => row.typeName !== null && PREFERRED_GAME_TYPE_NAMES.has(row.typeName)
  );
  const denoise = editionPool.filter(
    (row) => !row.typeName || !NOISY_GAME_TYPE_NAMES.has(row.typeName)
  );

  const pool =
    preferred.length > 0
      ? preferred
      : denoise.length > 0
        ? denoise
        : editionPool;

  return pool
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const typeDiff =
        gameTypeSortRank(a.typeName) - gameTypeSortRank(b.typeName);
      if (typeDiff !== 0) return typeDiff;
      if (a.release !== b.release) return a.release - b.release;
      return a.id - b.id;
    })
    .map((row) => row.game);
}

function toResults(
  games: IgdbGame[],
  japanRegionId: number | null
): GameResult[] {
  const byId = new Map<string, GameResult>();

  for (const game of games) {
    const idNum = asNumber(game.id);
    if (idNum === null) continue;
    const id = String(idNum);
    if (byId.has(id)) continue;

    const title = pickTitle(game, japanRegionId);
    if (!title) continue;

    byId.set(id, {
      id,
      title,
      creator: pickCreator(game),
      type: "game",
      imageUrl: pickImageUrl(game, japanRegionId),
    });
  }

  return Array.from(byId.values()).slice(0, MAX_RANKED_POOL);
}

type RankedPoolCacheEntry = {
  expiresAt: number;
  results: GameResult[];
};

const rankedPoolCache = new Map<string, RankedPoolCacheEntry>();
const rankedPoolInflight = new Map<string, Promise<GameResult[]>>();

function normalizeGameQueryKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 原文検索が0件のときだけ使う再試行クエリ。
 * 波ダッシュ・チルダ・中黒を空白に揃え、空白を畳む。
 * 文字を無差別に削除しない（長音「ー」や括弧などは残す）。
 */
function buildAlternateGameQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const softened = trimmed
    .normalize("NFKC")
    // 〜(WAVE DASH) ～(FULLWIDTH TILDE) ~ ∼ ⁓
    .replace(/[\u301C\uFF5E\u007E\u223C\u2053]/g, " ")
    // ・ ･ · • ∙
    .replace(/[\u30FB\uFF65\u00B7\u2022\u2219]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!softened) return null;
  // 原文（NFKC＋空白畳み）と同じなら再試行しても意味がない
  const baseline = trimmed.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (softened === baseline) return null;
  return softened;
}

function readRankedPoolCache(key: string): GameResult[] | null {
  const entry = rankedPoolCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    rankedPoolCache.delete(key);
    return null;
  }
  return entry.results;
}

function writeRankedPoolCache(key: string, results: GameResult[]): void {
  rankedPoolCache.set(key, {
    expiresAt: Date.now() + POOL_CACHE_TTL_MS,
    results,
  });
  while (rankedPoolCache.size > POOL_CACHE_MAX) {
    const oldest = rankedPoolCache.keys().next().value;
    if (oldest === undefined) break;
    rankedPoolCache.delete(oldest);
  }
}

function parseOffset(value: string | null): number | null {
  if (!value) return 0;
  if (!/^\d+$/.test(value)) return null;
  const offset = Number(value);
  if (!Number.isFinite(offset) || offset < 0 || offset > MAX_OFFSET) {
    return null;
  }
  return offset;
}

async function searchGamesByQuery(query: string): Promise<IgdbGame[]> {
  const body = [
    `search "${escapeApicalypseString(query)}";`,
    `fields ${GAME_FIELDS};`,
    `limit ${SEARCH_FETCH_LIMIT};`,
  ].join("\n");

  const result = await igdbPost<IgdbGame[]>("games", body);
  if (!result.ok) {
    throw Object.assign(result.error, { status: result.status });
  }
  return Array.isArray(result.data) ? result.data : [];
}

function collectLocalizationGameIds(
  rows: IgdbLocalizationHit[] | undefined
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const row of rows ?? []) {
    const gameId = asNumber(row.game);
    if (gameId === null || seen.has(gameId)) continue;
    seen.add(gameId);
    ids.push(gameId);
  }
  return ids;
}

/** ローカライズ題名とクエリの近さ（完全一致・番号＋副題付き続編を優先） */
function scoreLocalizationName(locName: string, query: string): number {
  const relation = classifyTitleAgainstQuery(locName, query);
  switch (relation) {
    case "exact":
      return 1000;
    case "query-subtitle":
      return 960;
    case "numbered-sequel":
      return 900;
    case "prefix": {
      const n = normalizeText(locName);
      const q = normalizeText(query);
      return 500 - Math.min(300, Math.max(0, n.length - q.length) * 12);
    }
    case "contains": {
      const n = normalizeText(locName);
      const q = normalizeText(query);
      return 200 - Math.min(180, Math.max(0, n.length - q.length) * 8);
    }
    default:
      return 0;
  }
}

function prioritizeLocalizationGameIds(
  rows: IgdbLocalizationHit[],
  query: string,
  keepLimit: number
): number[] {
  const scored = rows
    .map((row) => {
      const gameId = asNumber(row.game);
      const name = asString(row.name) ?? "";
      if (gameId === null || !name) return null;
      return {
        gameId,
        score: scoreLocalizationName(name, query),
        nameLen: name.length,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.nameLen !== b.nameLen) return a.nameLen - b.nameLen;
      return a.gameId - b.gameId;
    });

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const row of scored) {
    if (seen.has(row.gameId)) continue;
    seen.add(row.gameId);
    ids.push(row.gameId);
    if (ids.length >= keepLimit) break;
  }
  return ids;
}

/** 日本語正式名の完全一致（部分一致ノイズで埋もれない） */
async function findExactJapanLocalizations(
  query: string,
  japanRegionId: number
): Promise<number[]> {
  const body = [
    `fields name,region,game;`,
    `where name = "${escapeApicalypseString(query)}" & region = ${japanRegionId};`,
    `limit ${LOCALIZATION_EXACT_LIMIT};`,
  ].join("\n");

  const result = await igdbPost<IgdbLocalizationHit[]>(
    "game_localizations",
    body
  );
  if (!result.ok || !Array.isArray(result.data)) return [];
  return collectLocalizationGameIds(result.data);
}

async function findGamesViaJapanLocalizations(
  query: string,
  japanRegionId: number
): Promise<number[]> {
  const body = [
    `fields name,region,game,cover;`,
    `where name ~ *"${escapeApicalypseString(query)}"* & region = ${japanRegionId};`,
    `limit ${LOCALIZATION_FETCH_LIMIT};`,
  ].join("\n");

  const result = await igdbPost<IgdbLocalizationHit[]>(
    "game_localizations",
    body
  );
  if (!result.ok || !Array.isArray(result.data)) return [];
  return prioritizeLocalizationGameIds(
    result.data,
    query,
    LOCALIZATION_KEEP_LIMIT
  );
}

/**
 * 英語公式名の完全一致＋前方一致（副題付き原作を拾う）。
 * 例: query "Resident Evil 3" → "Resident Evil 3: Nemesis"
 */
async function findGamesByExactName(query: string): Promise<number[]> {
  const escaped = escapeApicalypseString(query);
  const exactBody = [
    `fields id,name;`,
    `where name = "${escaped}";`,
    `limit ${LOCALIZATION_EXACT_LIMIT};`,
  ].join("\n");
  const prefixBody = [
    `fields id,name;`,
    `where name ~ *"${escaped}"*;`,
    `limit 30;`,
  ].join("\n");

  const [exactResult, prefixResult] = await Promise.all([
    igdbPost<Array<{ id?: unknown; name?: unknown }>>("games", exactBody),
    igdbPost<Array<{ id?: unknown; name?: unknown }>>("games", prefixBody),
  ]);

  const scored: Array<{ id: number; score: number }> = [];
  const pushRow = (rows: Array<{ id?: unknown; name?: unknown }> | undefined) => {
    for (const row of rows ?? []) {
      const id = asNumber(row.id);
      const name = asString(row.name) ?? "";
      if (id === null || !name) continue;
      const relation = classifyTitleAgainstQuery(name, query);
      if (
        relation !== "exact" &&
        relation !== "query-subtitle" &&
        relation !== "numbered-sequel" &&
        relation !== "prefix"
      ) {
        continue;
      }
      scored.push({ id, score: relationScore(relation) });
    }
  };

  if (exactResult.ok) pushRow(exactResult.data);
  if (prefixResult.ok) pushRow(prefixResult.data);

  scored.sort((a, b) => b.score - a.score || a.id - b.id);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const row of scored) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    ids.push(row.id);
    if (ids.length >= LOCALIZATION_EXACT_LIMIT) break;
  }
  return ids;
}

async function fetchGamesByIds(ids: number[]): Promise<IgdbGame[]> {
  if (ids.length === 0) return [];
  // 呼び出し側で完全一致を先頭に並べている前提で上限を切る
  const unique = [...new Set(ids)].slice(
    0,
    Math.min(
      MAX_RANKED_POOL,
      Math.max(
        SEARCH_FETCH_LIMIT,
        LOCALIZATION_KEEP_LIMIT + LOCALIZATION_EXACT_LIMIT
      )
    )
  );
  const body = [
    `fields ${GAME_FIELDS};`,
    `where id = (${unique.join(",")});`,
    `limit ${unique.length};`,
  ].join("\n");

  const result = await igdbPost<IgdbGame[]>("games", body);
  if (!result.ok) {
    throw Object.assign(result.error, { status: result.status });
  }
  return Array.isArray(result.data) ? result.data : [];
}

function mergeGames(primary: IgdbGame[], secondary: IgdbGame[]): IgdbGame[] {
  const map = new Map<number, IgdbGame>();
  for (const game of [...primary, ...secondary]) {
    const id = asNumber(game.id);
    if (id === null || map.has(id)) continue;
    map.set(id, game);
  }
  return Array.from(map.values());
}

/**
 * 候補をまとめて取得・順位付けしたプールを返す。
 * ページングはプールのスライスのみ（IGDB offset では順位が崩れるため）。
 */
async function buildRankedGamePool(query: string): Promise<GameResult[]> {
  const japanRegionId = await resolveJapanRegionId();
  const typeNameById = await resolveGameTypeNameById();

  let games = await searchGamesByQuery(query);

  // 完全一致を必ず候補に入れる（部分一致ローカライズの順位・件数上限で原作が落ちる対策）
  const exactIds: number[] = [];
  if (japanRegionId !== null && hasJapaneseScript(query)) {
    exactIds.push(
      ...(await findExactJapanLocalizations(query, japanRegionId))
    );
  }
  if (!hasJapaneseScript(query) || exactIds.length === 0) {
    exactIds.push(...(await findGamesByExactName(query)));
  }

  // 日本語クエリは search が弱いことが多いので、部分一致ローカライズも併用
  const fuzzyLocIds: number[] = [];
  if (japanRegionId !== null && hasJapaneseScript(query)) {
    fuzzyLocIds.push(
      ...(await findGamesViaJapanLocalizations(query, japanRegionId))
    );
  } else if (games.length < 5 && japanRegionId !== null) {
    fuzzyLocIds.push(
      ...(await findGamesViaJapanLocalizations(query, japanRegionId))
    );
  }

  const boostIds = [...exactIds, ...fuzzyLocIds].filter(
    (id) => !games.some((game) => asNumber(game.id) === id)
  );
  if (boostIds.length > 0) {
    const prioritized = [
      ...exactIds.filter((id) => boostIds.includes(id)),
      ...boostIds.filter((id) => !exactIds.includes(id)),
    ];
    const extra = await fetchGamesByIds(prioritized);
    games = mergeGames(extra, games);
  }

  const ranked = filterAndRankGames(
    games,
    query,
    japanRegionId,
    typeNameById
  );
  return toResults(ranked, japanRegionId);
}

async function getRankedGamePool(query: string): Promise<GameResult[]> {
  const key = normalizeGameQueryKey(query);
  const cached = readRankedPoolCache(key);
  if (cached) return cached;

  const existing = rankedPoolInflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    // 1) 原文を優先
    let results = await buildRankedGamePool(query);
    // 2) 0件のときだけ表記ゆれ再試行（最大2回）
    if (results.length === 0) {
      const soft = buildAlternateGameQuery(query);
      const retries = [
        soft,
        ...buildNotationRetryQueries(query, 2),
        buildCandidatePrefixQuery(query),
      ].filter((value, index, list): value is string => {
        if (!value || value === query) return false;
        return list.indexOf(value) === index;
      });

      for (const retry of retries.slice(0, 2)) {
        const next = await buildRankedGamePool(retry);
        if (retry === soft) {
          if (next.length > 0) {
            results = next;
            break;
          }
          continue;
        }
        const filtered = next.filter((row) =>
          titlesMatchCompact(row.title, query)
        );
        if (filtered.length > 0) {
          results = filtered;
          break;
        }
      }
    }
    writeRankedPoolCache(key, results);
    return results;
  })();
  rankedPoolInflight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (rankedPoolInflight.get(key) === pending) {
      rankedPoolInflight.delete(key);
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const offset = parseOffset(searchParams.get("offset"));

  if (!query) {
    return NextResponse.json(
      { results: [], error: "検索キーワードが必要です" },
      { status: 400 }
    );
  }

  if (offset === null) {
    return NextResponse.json(
      { results: [], error: "不正なページ指定です" },
      { status: 400 }
    );
  }

  if (!hasIgdbCredentials()) {
    console.error("ゲーム検索: IGDB 認証情報が設定されていません");
    return NextResponse.json(
      { results: [], error: "ゲーム検索を利用できません" },
      { status: 503 }
    );
  }

  try {
    const pool = await getRankedGamePool(query);
    const page = pool.slice(offset, offset + PAGE_SIZE);
    const nextOffset =
      offset + page.length < pool.length ? offset + page.length : null;

    return NextResponse.json({
      results: page,
      nextOffset,
      total: pool.length,
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;

    if (status === 429) {
      return NextResponse.json(
        {
          results: [],
          nextOffset: null,
          error:
            "リクエストが多すぎます。しばらくしてから再試行してください",
        },
        { status: 429 }
      );
    }

    console.error("ゲーム検索エラー:", {
      name: error instanceof Error ? error.name : "Error",
      // message にトークン等が混ざらないよう固定文言中心
      status: status ?? null,
    });

    return NextResponse.json(
      { results: [], nextOffset: null, error: "ゲーム検索に失敗しました" },
      { status: 502 }
    );
  }
}
