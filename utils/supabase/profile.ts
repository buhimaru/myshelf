import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "../../types/profile";
import { normalizeDisplayNameInput } from "../shelfDisplay";

export async function fetchMyProfile(
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

export async function updateMyShelfPublic(
  supabase: SupabaseClient,
  userId: string,
  isPublic: boolean
): Promise<{ data: Profile | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_public: isPublic })
    .eq("id", userId)
    .select("id, is_public, display_name, username, avatar_url, created_at")
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as Profile, error: null };
}

/**
 * 本人の display_name のみ更新。username は触らない。
 * RLS により他ユーザー行の更新は拒否される想定。
 */
export async function updateMyDisplayName(
  supabase: SupabaseClient,
  userId: string,
  rawName: string
): Promise<{ data: Profile | null; error: Error | null }> {
  const normalized = normalizeDisplayNameInput(rawName);
  if (!normalized.ok) {
    return { data: null, error: new Error(normalized.error) };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: normalized.value })
    .eq("id", userId)
    .select("id, is_public, display_name, username, avatar_url, created_at")
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as Profile, error: null };
}

export function buildShelfShareUrl(userId: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/shelf/${userId}`;
}
