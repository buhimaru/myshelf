import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ShelfSearchHit,
  ShelfSearchResult,
  ShelfSearchSortOrder,
} from "../../types/shelfSearch";
import {
  SHELF_SEARCH_MAX_LENGTH,
  SHELF_SEARCH_MIN_LENGTH,
  SHELF_SEARCH_PAGE_SIZE,
} from "../../types/shelfSearch";

type RpcRow = {
  user_id?: unknown;
  display_name?: unknown;
  representative_title?: unknown;
  representative_category?: unknown;
  representative_created_at?: unknown;
  match_count?: unknown;
  username?: unknown;
};

type RpcPayload = {
  total_count?: unknown;
  limit?: unknown;
  offset?: unknown;
  sort_order?: unknown;
  query?: unknown;
  rows?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function mapHit(row: RpcRow): ShelfSearchHit | null {
  const userId = asString(row.user_id);
  const displayName = asString(row.display_name);
  const title = asString(row.representative_title);
  if (!userId || !displayName || !title) return null;

  return {
    userId,
    displayName,
    representativeTitle: title,
    representativeCategory: asString(row.representative_category),
    representativeCreatedAt: asString(row.representative_created_at),
    matchCount: asNumber(row.match_count) ?? 1,
  };
}

function parsePayload(data: unknown): ShelfSearchResult {
  const payload = (data ?? {}) as RpcPayload;
  const rowsRaw = Array.isArray(payload.rows) ? payload.rows : [];
  const rows = rowsRaw
    .map((row) => mapHit(row as RpcRow))
    .filter((row): row is ShelfSearchHit => row !== null);

  const sortRaw = asString(payload.sort_order);
  const sortOrder: ShelfSearchSortOrder =
    sortRaw === "oldest" ? "oldest" : "newest";

  return {
    totalCount: asNumber(payload.total_count) ?? 0,
    limit: asNumber(payload.limit) ?? SHELF_SEARCH_PAGE_SIZE,
    offset: asNumber(payload.offset) ?? 0,
    sortOrder,
    query: asString(payload.query) ?? "",
    rows,
  };
}

export function validateShelfSearchQuery(
  raw: string
): { ok: true; query: string } | { ok: false; error: string } {
  const query = raw.trim();
  if (query.length < SHELF_SEARCH_MIN_LENGTH) {
    return {
      ok: false,
      error: `作品名は${SHELF_SEARCH_MIN_LENGTH}文字以上で入力してください。`,
    };
  }
  if (query.length > SHELF_SEARCH_MAX_LENGTH) {
    return {
      ok: false,
      error: `作品名は${SHELF_SEARCH_MAX_LENGTH}文字以内で入力してください。`,
    };
  }
  return { ok: true, query };
}

/**
 * 公開棚タイトル検索。items を直接 SELECT せず RPC のみ使う。
 */
export async function searchPublicShelvesByTitle(
  supabase: SupabaseClient,
  args: {
    query: string;
    sortOrder?: ShelfSearchSortOrder;
    limit?: number;
    offset?: number;
  }
): Promise<{ data: ShelfSearchResult | null; error: Error | null }> {
  const validated = validateShelfSearchQuery(args.query);
  if (!validated.ok) {
    return { data: null, error: new Error(validated.error) };
  }

  const sortOrder: ShelfSearchSortOrder =
    args.sortOrder === "oldest" ? "oldest" : "newest";
  const limit = Math.min(
    Math.max(args.limit ?? SHELF_SEARCH_PAGE_SIZE, 1),
    50
  );
  const offset = Math.max(args.offset ?? 0, 0);

  const { data, error } = await supabase.rpc(
    "search_public_shelves_by_title",
    {
      search_query: validated.query,
      sort_order: sortOrder,
      page_limit: limit,
      page_offset: offset,
    }
  );

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: parsePayload(data), error: null };
}
