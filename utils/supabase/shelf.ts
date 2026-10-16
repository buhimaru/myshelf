import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { MediaItem } from "../../types/media";
import type { Profile } from "../../types/profile";
import { mapDbItemToMediaItem } from "../shelfDisplay";
import { canViewUserItems } from "./follow";

export type ShelfAccess =
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "private"; profile: Profile }
  | { kind: "ok"; profile: Profile; items: MediaItem[] };

async function fetchProfileById(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: Profile | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_public, display_name, username, avatar_url, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as Profile | null, error: null };
}

async function fetchShelfItems(
  supabase: SupabaseClient,
  ownerId: string
): Promise<{ data: MediaItem[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, title, category, creator, image_url, description, created_at, user_id"
    )
    .eq("user_id", ownerId);

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  return {
    data: (data ?? []).map(mapDbItemToMediaItem),
    error: null,
  };
}

/**
 * 他人の棚を取得する。作品の閲覧可否はクライアント側の is_public 判定ではなく、
 * まず items の RLS 結果を正とし、0件時のみ can_view_user_items で
 * 「空の棚」と「非公開」を区別する。
 */
export async function loadPublicShelf(
  supabase: SupabaseClient,
  ownerId: string,
  viewer: User | null
): Promise<ShelfAccess> {
  const profileResult = await fetchProfileById(supabase, ownerId);

  if (profileResult.error) {
    return { kind: "error", message: profileResult.error.message };
  }

  if (!profileResult.data) {
    return { kind: "not_found" };
  }

  const profile = profileResult.data;
  const itemsResult = await fetchShelfItems(supabase, ownerId);

  if (itemsResult.error) {
    return { kind: "error", message: itemsResult.error.message };
  }

  const items = itemsResult.data;
  const isOwner = Boolean(viewer && viewer.id === ownerId);

  if (items.length > 0) {
    return { kind: "ok", profile, items };
  }

  // 0件: RLSで見えるが空なのか、RLSで隠されたのかを区別する
  let canViewEmpty = isOwner || Boolean(profile.is_public);
  if (!canViewEmpty && viewer && !isOwner) {
    canViewEmpty = await canViewUserItems(supabase, ownerId);
  }

  if (!canViewEmpty) {
    return { kind: "private", profile };
  }

  return { kind: "ok", profile, items };
}
