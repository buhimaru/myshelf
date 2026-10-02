export function formatAuthError(error: unknown): string {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : error instanceof Error
        ? error.message
        : "";

  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  if (
    normalized.includes("user already registered") ||
    normalized.includes("already registered")
  ) {
    return "このメールアドレスは既に登録されています。ログインしてください。";
  }
  if (normalized.includes("email not confirmed")) {
    return "確認メールのリンクを開いてから、もう一度ログインしてください。";
  }
  if (normalized.includes("password") && normalized.includes("6")) {
    return "パスワードは6文字以上にしてください。";
  }
  if (
    normalized.includes("unable to validate email") ||
    normalized.includes("invalid email")
  ) {
    return "メールアドレスの形式が正しくありません。";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "リクエストが多すぎます。しばらく待ってからやり直してください。";
  }
  if (normalized.includes("signup is disabled")) {
    return "現在、新規登録は停止されています。";
  }
  if (!message) {
    return "認証中にエラーが発生しました。時間をおいて再度お試しください。";
  }

  return `認証に失敗しました: ${message}`;
}
