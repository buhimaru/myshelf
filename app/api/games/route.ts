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
const LOCALIZATION_FETCH_LIMIT = 20;
const RESULT_LIMIT = 20;
const HAS_JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/;

const GAME_FIELDS = [
  "id",
  "name",
  "cover.image_id",
  "version_parent",
  "game_type",
  "game_type.type",
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

function scoreGame(title: string, englishName: string, query: string): number {
  const q = normalizeText(query);
  const t = normalizeText(title);
  const e = normalizeText(englishName);
  if (!q) return 0;

  let score = 0;
  if (t === q || e === q) score += 200;
  if (t.startsWith(q) || e.startsWith(q)) score += 80;
  if (t.includes(q) || e.includes(q)) score += 40;

  for (const token of q.split(" ").filter((part) => part.length >= 2)) {
    if (t.includes(token) || e.includes(token)) score += 12;
  }

  return score;
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
      return {
        game,
        id,
        title,
        typeName,
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

  return Array.from(byId.values()).slice(0, RESULT_LIMIT);
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

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const row of result.data) {
    const gameId = asNumber(row.game);
    if (gameId === null || seen.has(gameId)) continue;
    seen.add(gameId);
    ids.push(gameId);
  }
  return ids;
}

async function fetchGamesByIds(ids: number[]): Promise<IgdbGame[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)].slice(0, SEARCH_FETCH_LIMIT);
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json(
      { results: [], error: "検索キーワードが必要です" },
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
    const japanRegionId = await resolveJapanRegionId();
    const typeNameById = await resolveGameTypeNameById();

    let games = await searchGamesByQuery(query);

    // 日本語クエリで search ヒットが薄い場合、日本ローカライズ名から補完
    const needsLocalizationBoost =
      hasJapaneseScript(query) && games.length < 5 && japanRegionId !== null;

    if (needsLocalizationBoost && japanRegionId !== null) {
      const locIds = await findGamesViaJapanLocalizations(
        query,
        japanRegionId
      );
      const missing = locIds.filter(
        (id) => !games.some((game) => asNumber(game.id) === id)
      );
      if (missing.length > 0) {
        const extra = await fetchGamesByIds(missing);
        games = mergeGames(games, extra);
      }
    }

    const ranked = filterAndRankGames(
      games,
      query,
      japanRegionId,
      typeNameById
    );
    const results = toResults(ranked, japanRegionId);

    return NextResponse.json({ results });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;

    if (status === 429) {
      return NextResponse.json(
        {
          results: [],
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
      { results: [], error: "ゲーム検索に失敗しました" },
      { status: 502 }
    );
  }
}
