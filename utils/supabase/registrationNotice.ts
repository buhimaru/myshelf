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
 */

const PENDING_KEY = "myshelf-email-confirm-pending";
const RETURN_KEY = "myshelf-email-confirm-return";
const COMPLETE_KEY = "myshelf-registration-complete-notice";

export type EmailConfirmPending = {
  /** updateUser 開始時点の匿名 user.id（昇格後も同一のはず） */
  userId: string;
  email: string;
};

export type RegistrationNoticeKind =
  | "email_pending"
  | "registered"
  | "confirm_login";

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
 * URL の email_confirmed=1 だけを除去する。
 * code / hash など Supabase 用パラメータは触らない。
 */
export function stripEmailConfirmedParamFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("email_confirmed")) return;
    url.searchParams.delete("email_confirmed");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
  } catch {
    // ignore
  }
}

export function buildEmailConfirmRedirectTo(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/?email_confirmed=1`;
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
      return true;
    }
    // 別ゲストの pending が残っている
    clearEmailConfirmPending();
  }

  // complete 印は「pending.userId 一致を確認した直後」にだけ付ける。
  // 通常ログイン経路では clearAllRegistrationUpgradeState 済みのはず。
  return consumeRegistrationCompleteNotice(user.id);
}
