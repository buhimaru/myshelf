import type { SupabaseClient } from "@supabase/supabase-js";

import type { Profile } from "@/lib/profile";
import type { Work } from "@/lib/work";

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
      .select("*")
      .eq("is_public", true)
      .ilike("title", like)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("profiles")
      .select("id, username, display_name, created_at")
      .or(`username.ilike.${like},display_name.ilike.${like}`)
      .limit(20),
  ]);

  const error =
    worksResult.error?.message ?? profilesResult.error?.message ?? null;

  return {
    works: ((worksResult.data as Work[] | null) ?? []).filter(
      (work) => work.is_public !== false,
    ),
    profiles: (profilesResult.data as Profile[] | null) ?? [],
    error,
  };
}

export async function selectPublicWorks(supabase: SupabaseClient, limit = 24) {
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  return {
    data: ((data as Work[] | null) ?? []).filter((work) => work.is_public !== false),
    error,
  };
}

export async function selectPublicWorksByUser(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .eq("user_id", userId)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  return {
    data: ((data as Work[] | null) ?? []).filter((work) => work.is_public !== false),
    error,
  };
}
