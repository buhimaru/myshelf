import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * 匿名ゲストかどうか。
 * is_anonymous が省略された場合はゲスト扱いにしない（誤ってフォロー導線を隠さない）。
 */
export function isAnonymousAuthUser(
  user: User | null | undefined
): boolean {
  return user?.is_anonymous === true;
}

/**
 * 本登録済み（非匿名）のログインユーザーか。
 */
export function isRegisteredAuthUser(
  user: User | null | undefined
): boolean {
  return Boolean(user) && !isAnonymousAuthUser(user);
}

/**
 * 認証ユーザーを購読する。
 *
 * session.user だけだと is_anonymous が古いまま／欠落することがあるため、
 * 各イベント後に getUser() で確定してから通知する。
 * 古い getUser 応答が新しいイベント結果を上書きしないよう generation で無効化する。
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

  const resolveUser = (gen: number) => {
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled || gen !== generation) return;
      if (error) {
        apply(null, gen);
        return;
      }
      apply(data.user, gen);
    });
  };

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => {
    const gen = ++generation;
    resolveUser(gen);
  });

  return () => {
    cancelled = true;
    generation += 1;
    subscription.unsubscribe();
  };
}
