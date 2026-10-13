import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * 認証ユーザーを購読する。
 * getUser() の遅延応答が、その後の onAuthStateChange 結果を上書きしない。
 */
export function subscribeAuthUser(
  supabase: SupabaseClient,
  onUser: (user: User | null) => void
): () => void {
  let cancelled = false;
  let generation = 0;

  const apply = (user: User | null, gen: number) => {
    if (cancelled || gen !== generation) return;
    onUser(user);
  };

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    // 以降に返る古い getUser を無効化
    const gen = ++generation;
    apply(session?.user ?? null, gen);
  });

  const gen = ++generation;
  void supabase.auth.getUser().then(({ data }) => {
    apply(data.user, gen);
  });

  return () => {
    cancelled = true;
    generation += 1;
    subscription.unsubscribe();
  };
}
