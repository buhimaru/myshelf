import type { SupabaseClient } from "@supabase/supabase-js";

import type { Profile } from "@/lib/profile";
import type { Work } from "@/lib/work";

const PUBLIC_WORK_SELECT =
  "*, profiles!inner(is_public, username, display_name)";

export function isPublishedPublicWork(work: Work) {
  if (!work.user_id) {
    return false;
  }

  const profile = Array.isArray(work.profiles)
    ? work.profiles[0]
    : work.profiles;
  return profile?.is_public === true;
}

export type CatalogSearchResult = {
  works: Work[];
  profiles: Profile[];
  error: string | null;
};

export async function searchPublicCatalog(
  supabase: SupabaseClient,
  rawQuery: string,
): Promise<CatalogSearchResult> {
  const query = rawQuery.trim();
  if (!query) {
    return { works: [], profiles: [], error: null };
  }

  const like = `%${query}%`;

  const [worksResult, profilesResult] = await Promise.all([
    supabase
      .from("works")
      .select(PUBLIC_WORK_SELECT)
      .eq("profiles.is_public", true)
      .not("user_id", "is", null)
      .ilike("title", like)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("profiles")
      .select("id, username, display_name, is_public, created_at")
      .eq("is_public", true)
      .or(`username.ilike.${like},display_name.ilike.${like}`)
      .limit(20),
  ]);

  const error =
    worksResult.error?.message ?? profilesResult.error?.message ?? null;

  return {
    works: ((worksResult.data as Work[] | null) ?? []).filter(
      isPublishedPublicWork,
    ),
    profiles: ((profilesResult.data as Profile[] | null) ?? []).filter(
      (profile) => profile.is_public === true,
    ),
    error,
  };
}

export async function selectPublicWorks(supabase: SupabaseClient, limit = 24) {
  const { data, error } = await supabase
    .from("works")
    .select(PUBLIC_WORK_SELECT)
    .eq("profiles.is_public", true)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return {
    data: ((data as Work[] | null) ?? []).filter(isPublishedPublicWork),
    error,
  };
}

export async function selectPublicWorksByUser(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("works")
    .select(PUBLIC_WORK_SELECT)
    .eq("user_id", userId)
    .eq("profiles.is_public", true)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false });

  return {
    data: ((data as Work[] | null) ?? []).filter(isPublishedPublicWork),
    error,
  };
}
