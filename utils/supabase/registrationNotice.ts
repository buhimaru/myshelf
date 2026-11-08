/**
 * ゲスト→正式登録のメール確認まわり（UI案内用）。
 * トークンやパスワードは保存しない。
 *
 * 完了通知の条件（すべて必須）:
 * - 現在のユーザーが非匿名
 * - 登録開始時に保存した pending.userId と現在の user.id が一致
 *   （または、その検証後にだけ付ける complete 印が同じ user.id）
 * - 直前セッションから別 user.id へ切り替わっていない
 *
 * メール一致・「以前ゲストだった」だけでは完了としない。
 *
 * 確認待ち中に refreshSession() を呼ぶと PKCE code verifier が消えることがある
 * （supabase-js #2512）。待ち中は getUser() のみで検知し、正式化を確認してから
 * 一度だけ refreshSession() する。
 */

const PENDING_KEY = "myshelf-email-confirm-pending";
const RETURN_KEY = "myshelf-email-confirm-return";
const COMPLETE_KEY = "myshelf-registration-complete-notice";
/** セッションなしの新規登録（Landing signUp）用。userId は持たない */
const SIGNUP_EMAIL_KEY = "myshelf-signup-email-pending";

/** 確認待ち中の getUser ポーリング間隔（ms） */
export const EMAIL_CONFIRM_POLL_MS = 4000;

export type EmailConfirmPending = {
  /** updateUser 開始時点の匿名 user.id（昇格後も同一のはず） */
  userId: string;
  email: string;
};

export type RegistrationNoticeKind =
  | "email_pending"
  | "registered"
  | "confirm_login";

export type AuthCallbackError = {
  code: string;
  description: string;
};

type RegistrationCompletePayload = {
  userId: string;
};

export type ClaimUpgradeContext = {
  /** ログイン／セッション更新前の user.id */
  previousUserId?: string | null;
  /** 直前が匿名ゲストだったか */
  previousWasAnonymous?: boolean;
};

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function setEmailConfirmPending(pending: EmailConfirmPending): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // ignore quota / private mode
  }
}

export function getEmailConfirmPending(): EmailConfirmPending | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EmailConfirmPending>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.email !== "string" ||
      !parsed.userId ||
      !parsed.email
    ) {
      clearEmailConfirmPending();
      return null;
    }
    return { userId: parsed.userId, email: parsed.email };
  } catch {
    clearEmailConfirmPending();
    return null;
  }
}

export function clearEmailConfirmPending(): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/**
 * 現在ユーザー向けの pending だけ返す。
 * userId が一致しない古い pending は破棄する。
 */
export function getPendingForUser(userId: string): EmailConfirmPending | null {
  const pending = getEmailConfirmPending();
  if (!pending) return null;
  if (pending.userId !== userId) {
    clearEmailConfirmPending();
    return null;
  }
  return pending;
}

/** メール確認リンクからの戻りを記録（完了判定には使わない） */
export function markEmailConfirmReturn(): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(RETURN_KEY, "1");
  } catch {
    // ignore
  }
}

export function consumeEmailConfirmReturn(): boolean {
  if (!canUseSessionStorage()) return false;
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    if (value !== "1") return false;
    sessionStorage.removeItem(RETURN_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * セッションなしの新規登録で、確認後ログイン用にメールだけ覚える。
 * パスワードは保存しない。
 */
export function setSignupEmailPending(email: string): void {
  if (!canUseSessionStorage()) return;
  const trimmed = email.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(SIGNUP_EMAIL_KEY, trimmed);
  } catch {
    // ignore
  }
}

export function getSignupEmailPending(): string | null {
  if (!canUseSessionStorage()) return null;
  try {
    const value = sessionStorage.getItem(SIGNUP_EMAIL_KEY);
    return value?.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function clearSignupEmailPending(): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(SIGNUP_EMAIL_KEY);
  } catch {
    // ignore
  }
}

/**
 * URL の email_confirmed=1 と Auth エラー用クエリだけを除去する。
 * code / hash など Supabase 用パラメータは触らない。
 */
export function stripAuthCallbackParamsFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of [
      "email_confirmed",
      "error",
      "error_code",
      "error_description",
    ]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
  } catch {
    // ignore
  }
}

/** @deprecated stripAuthCallbackParamsFromUrl を使う */
export function stripEmailConfirmedParamFromUrl(): void {
  stripAuthCallbackParamsFromUrl();
}

/** メール確認後の戻り先パス（スマホからも開ける公開 origin と組み合わせる） */
export const EMAIL_CONFIRM_PATH = "/auth/confirmed";

export type EmailConfirmRedirectPlan = {
  /** emailRedirectTo に渡す完全 URL */
  redirectTo: string;
  /** リダイレクト先 origin */
  origin: string;
  /** 現在の登録画面 origin が loopback か */
  fromLoopback: boolean;
  /** リダイレクト先が loopback（スマホから開けない）か */
  redirectIsLoopback: boolean;
  /**
   * NEXT_PUBLIC_SITE_URL を使ったか。
   * ローカル登録→公開URLへ飛ばすのは明示設定時のみ（未デプロイ本番へ無条件転送しない）。
   */
  usedPublicSiteUrl: boolean;
};

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** localhost / 127.0.0.1 / ::1 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * メール確認リンク用の公開 origin。
 * 未設定・不正な値のときは null（現在 origin を使う）。
 */
export function getConfiguredPublicSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return normalizeOrigin(url.origin);
  } catch {
    return null;
  }
}

/**
 * emailRedirectTo の向き先を決める。
 *
 * - 本番（非 loopback）: いま開いている origin → スマホでも同じ公開URLへ
 * - ローカル + NEXT_PUBLIC_SITE_URL（非 loopback）: 公開URLへ（デプロイ済み前提の明示オプトイン）
 * - ローカルのみ: localhost のまま（認証は通るがスマホではページ表示不可 → UIで案内）
 */
export function planEmailConfirmRedirect(
  currentOrigin: string
): EmailConfirmRedirectPlan {
  const current = normalizeOrigin(currentOrigin);
  const fromLoopback = isLoopbackOrigin(current);
  const configured = getConfiguredPublicSiteOrigin();

  if (fromLoopback && configured && !isLoopbackOrigin(configured)) {
    return {
      redirectTo: `${configured}${EMAIL_CONFIRM_PATH}`,
      origin: configured,
      fromLoopback: true,
      redirectIsLoopback: false,
      usedPublicSiteUrl: true,
    };
  }

  return {
    redirectTo: `${current}${EMAIL_CONFIRM_PATH}`,
    origin: current,
    fromLoopback,
    redirectIsLoopback: isLoopbackOrigin(current),
    usedPublicSiteUrl: false,
  };
}

export function buildEmailConfirmRedirectTo(origin: string): string {
  return planEmailConfirmRedirect(origin).redirectTo;
}

/** 登録直後 UI 用の、リダイレクト先に関する補足文（不要なら空文字） */
export function emailConfirmRedirectHint(
  plan: EmailConfirmRedirectPlan
): string {
  if (plan.usedPublicSiteUrl) {
    return "確認リンクは公開サイトへ開きます。スマホでもページを表示できます。確認後は、このPCからログインしてください。";
  }
  if (plan.redirectIsLoopback) {
    return "開発環境（localhost）のため、スマホでは確認リンク先のページを開けません。認証自体は完了するので、このPCからログインしてください。公開サイトでの確認表示には NEXT_PUBLIC_SITE_URL の設定とデプロイが必要です。";
  }
  return "";
}

/**
 * メール確認リンク失敗時のクエリを読む（消費はしない）。
 * Supabase は error / error_code / error_description を付与する。
 */
export function readAuthCallbackErrorFromLocation(
  search: string = typeof window !== "undefined" ? window.location.search : ""
): AuthCallbackError | null {
  try {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
    const error = params.get("error")?.trim() ?? "";
    const code = (params.get("error_code") ?? error).trim();
    const description = (
      params.get("error_description") ??
      params.get("error") ??
      ""
    )
      .replace(/\+/g, " ")
      .trim();
    if (!error && !code && !description) return null;
    return {
      code: code || "auth_callback_error",
      description: description || error || "auth_callback_error",
    };
  } catch {
    return null;
  }
}

/** メール確認コールバック待ち（code 交換・戻り印）かどうか */
export function hasEmailConfirmCallbackSignals(
  search: string = typeof window !== "undefined" ? window.location.search : ""
): boolean {
  try {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
    if (params.get("email_confirmed") === "1") return true;
    if (params.has("code")) return true;
    if (params.has("error") || params.has("error_code")) return true;
    return false;
  } catch {
    return false;
  }
}

export function clearRegistrationCompleteNotice(): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(COMPLETE_KEY);
  } catch {
    // ignore
  }
}

/** ゲスト昇格フロー用の一時情報をすべて破棄 */
export function clearAllRegistrationUpgradeState(): void {
  clearEmailConfirmPending();
  clearRegistrationCompleteNotice();
  clearSignupEmailPending();
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
}

/**
 * 正式登録完了バナーを、指定 userId の画面でのみ一度出す。
 * pending 一致を確認した直後だけ呼ぶこと。
 */
export function markRegistrationCompleteNotice(userId: string): void {
  if (!canUseSessionStorage() || !userId) return;
  try {
    const payload: RegistrationCompletePayload = { userId };
    sessionStorage.setItem(COMPLETE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/**
 * expectedUserId と一致する完了印だけ消費して true。
 * 不一致・旧形式 `"1"` は破棄して false。
 */
export function consumeRegistrationCompleteNotice(
  expectedUserId: string
): boolean {
  if (!canUseSessionStorage() || !expectedUserId) return false;
  try {
    const raw = sessionStorage.getItem(COMPLETE_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(COMPLETE_KEY);

    // 旧形式: ユーザー紐付けなし → 常に破棄
    if (raw === "1") return false;

    const parsed = JSON.parse(raw) as Partial<RegistrationCompletePayload>;
    return typeof parsed.userId === "string" && parsed.userId === expectedUserId;
  } catch {
    clearRegistrationCompleteNotice();
    return false;
  }
}

type UpgradeUser = {
  id: string;
  is_anonymous?: boolean;
};

/**
 * 同一 user_id のゲスト→正式変換が確認できたときだけ true。
 */
export function claimGuestUpgradeComplete(
  user: UpgradeUser | null,
  context: ClaimUpgradeContext = {}
): boolean {
  if (!user?.id) {
    clearAllRegistrationUpgradeState();
    return false;
  }

  const { previousUserId = null } = context;

  // 別アカウントへの切り替え（ゲスト→既存正式など）は昇格ではない
  if (previousUserId && previousUserId !== user.id) {
    clearAllRegistrationUpgradeState();
    return false;
  }

  if (user.is_anonymous) {
    getPendingForUser(user.id);
    clearRegistrationCompleteNotice();
    return false;
  }

  const pending = getEmailConfirmPending();
  if (pending) {
    if (pending.userId === user.id) {
      clearEmailConfirmPending();
      clearRegistrationCompleteNotice();
      clearSignupEmailPending();
      return true;
    }
    // 別ゲストの pending が残っている
    clearEmailConfirmPending();
  }

  // complete 印は「pending.userId 一致を確認した直後」にだけ付ける。
  // 通常ログイン経路では clearAllRegistrationUpgradeState 済みのはず。
  return consumeRegistrationCompleteNotice(user.id);
}
