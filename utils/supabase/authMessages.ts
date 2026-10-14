/**
 * 認証エラーメッセージのユーザー向け日本語化。
 * パスワード等の秘密情報は含めない。未知の文言は誤訳せず短く案内する。
 */

type AuthErrorLike = {
  message?: string;
  code?: string;
} | null;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Supabase Auth のエラーを、画面表示用の日本語にする。
 */
export function formatAuthErrorMessage(
  error: AuthErrorLike,
  context: "sign_up" | "sign_in" | "update" = "update"
): string {
  const message = error?.message?.trim() ?? "";
  const code = error?.code?.trim().toLowerCase() ?? "";
  const lower = normalize(message);

  if (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already registered") ||
    code === "user_already_exists" ||
    code === "email_exists"
  ) {
    return "このメールアドレスはすでに登録されています。既存のアカウントをお持ちの場合は、ログインしてください。";
  }

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials") ||
    code === "invalid_credentials"
  ) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }

  if (
    lower.includes("email not confirmed") ||
    code === "email_not_confirmed"
  ) {
    return "メールアドレスの確認が完了していません。確認メール内のリンクを開いてください。";
  }

  if (
    lower.includes("password should be at least") ||
    lower.includes("password is too short") ||
    code === "weak_password"
  ) {
    return "パスワードが短すぎます。もう少し長いパスワードを設定してください。";
  }

  if (
    lower.includes("unable to validate email") ||
    lower.includes("invalid email") ||
    (code === "validation_failed" && lower.includes("email"))
  ) {
    return "メールアドレスの形式が正しくないようです。入力内容を確認してください。";
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("for security purposes") ||
    code === "over_request_rate_limit"
  ) {
    return "リクエストが多すぎます。しばらく時間をおいてから再度お試しください。";
  }

  if (!message) {
    if (context === "sign_in") return "ログインに失敗しました。入力内容を確認してください。";
    if (context === "sign_up") return "新規登録に失敗しました。入力内容を確認してください。";
    return "アカウント登録に失敗しました。入力内容を確認してください。";
  }

  // 未知の英語メッセージはそのまま出さず、文脈に応じた短い案内にする
  if (/[A-Za-z]{4,}/.test(message) && !/[ぁ-んァ-ン一-龥]/.test(message)) {
    if (context === "sign_in") {
      return "ログインに失敗しました。入力内容を確認するか、しばらくしてから再度お試しください。";
    }
    if (context === "sign_up") {
      return "新規登録に失敗しました。入力内容を確認するか、しばらくしてから再度お試しください。";
    }
    return "アカウント登録に失敗しました。入力内容を確認するか、しばらくしてから再度お試しください。";
  }

  return message;
}
