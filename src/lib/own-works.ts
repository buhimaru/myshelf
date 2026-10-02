import type { SupabaseClient } from "@supabase/supabase-js";

import type { Work } from "@/lib/work";

function isOwnWork(work: Work, userId: string) {
  return work.user_id === userId;
}

export async function selectOwnWorks(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { user: null, data: [] as Work[], error: null };
  }

  const { data, error } = await supabase
    .from("works")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const ownWorks = ((data as Work[] | null) ?? []).filter((work) =>
    isOwnWork(work, user.id),
  );

  return {
    user,
    data: ownWorks,
    error,
  };
}

export function filterOwnWorks(works: Work[], userId: string | null | undefined) {
  if (!userId) {
    return [] as Work[];
  }

  return works.filter((work) => isOwnWork(work, userId));
}
