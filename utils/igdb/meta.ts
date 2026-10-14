import { igdbPost } from "./client";

type RegionRow = {
  id?: unknown;
  name?: unknown;
  identifier?: unknown;
  category?: unknown;
};

type GameTypeRow = {
  id?: unknown;
  type?: unknown;
};

type MetaCache<T> = {
  value: T;
  expiresAtMs: number;
};

const META_TTL_MS = 24 * 60 * 60 * 1000;

let japanRegionCache: MetaCache<number> | null = null;
let gameTypeNameByIdCache: MetaCache<Map<number, string>> | null = null;

/**
 * 表示・登録向けに優先する game_type.type（文字列）。
 * ID は環境によって変わらない想定だが、判定は API 応答の type 名を使う。
 */
export const PREFERRED_GAME_TYPE_NAMES = new Set([
  "Main Game",
  "Expansion",
  "Standalone Expansion",
  "Remake",
  "Remaster",
  "Expanded Game",
  "Port",
]);

/** ノイズになりやすい種別（type 名）。優先セットが空のときの二次除外用 */
export const NOISY_GAME_TYPE_NAMES = new Set([
  "DLC",
  "Mod",
  "Bundle",
  "Episode",
  "Season",
  "Pack / Addon",
  "Update",
  "Fork",
]);

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * /regions から日本ロケールを解決する。
 * 実測: identifier "ja-JP", name "Japan", category "locale"
 */
export async function resolveJapanRegionId(): Promise<number | null> {
  if (japanRegionCache && japanRegionCache.expiresAtMs > Date.now()) {
    return japanRegionCache.value;
  }

  const result = await igdbPost<RegionRow[]>(
    "regions",
    "fields id,name,identifier,category; limit 50;"
  );

  if (!result.ok || !Array.isArray(result.data)) {
    return japanRegionCache?.value ?? null;
  }

  const rows = result.data;
  const byIdentifier = rows.find(
    (row) => asString(row.identifier)?.toLowerCase() === "ja-jp"
  );
  const byNameLocale = rows.find(
    (row) =>
      asString(row.name)?.toLowerCase() === "japan" &&
      asString(row.category)?.toLowerCase() === "locale"
  );
  const byName = rows.find(
    (row) => asString(row.name)?.toLowerCase() === "japan"
  );

  const id =
    asNumber(byIdentifier?.id) ??
    asNumber(byNameLocale?.id) ??
    asNumber(byName?.id);

  if (id === null) return japanRegionCache?.value ?? null;

  japanRegionCache = { value: id, expiresAtMs: Date.now() + META_TTL_MS };
  return id;
}

export async function resolveGameTypeNameById(): Promise<Map<number, string>> {
  if (gameTypeNameByIdCache && gameTypeNameByIdCache.expiresAtMs > Date.now()) {
    return gameTypeNameByIdCache.value;
  }

  const result = await igdbPost<GameTypeRow[]>(
    "game_types",
    "fields id,type; limit 50; sort id asc;"
  );

  const map = new Map<number, string>();
  if (result.ok && Array.isArray(result.data)) {
    for (const row of result.data) {
      const id = asNumber(row.id);
      const type = asString(row.type);
      if (id === null || !type) continue;
      map.set(id, type);
    }
  }

  if (map.size > 0) {
    gameTypeNameByIdCache = {
      value: map,
      expiresAtMs: Date.now() + META_TTL_MS,
    };
  }

  return map;
}

export function resolveGameTypeName(
  gameType: unknown,
  typeNameById: Map<number, string>
): string | null {
  if (gameType && typeof gameType === "object") {
    const obj = gameType as { id?: unknown; type?: unknown };
    const named = asString(obj.type);
    if (named) return named;
    const id = asNumber(obj.id);
    if (id !== null) return typeNameById.get(id) ?? null;
    return null;
  }

  const asId = asNumber(gameType);
  if (asId !== null) return typeNameById.get(asId) ?? null;
  return asString(gameType);
}
