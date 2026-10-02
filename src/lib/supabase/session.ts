type AuthLike = {
  auth: {
    getSession: () => Promise<{
      data: { session: unknown } | null;
      error: { message?: string; name?: string } | null;
    }>;
    getUser: () => Promise<{
      data: { user: unknown } | null;
      error: { message?: string; name?: string } | null;
    }>;
  };
};

export function isAuthSessionMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    name === "AuthSessionMissingError" ||
    message.toLowerCase().includes("auth session missing")
  );
}

export async function getCurrentUser<TClient extends AuthLike>(supabase: TClient) {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      if (isAuthSessionMissingError(sessionError)) {
        return null;
      }
      console.error("[MyShelf] getSession failed", sessionError);
      return null;
    }

    if (!sessionData?.session) {
      return null;
    }

    const { data, error } = await supabase.auth.getUser();

    if (error) {
      if (isAuthSessionMissingError(error)) {
        return null;
      }
      console.error("[MyShelf] getUser failed", error);
      return null;
    }

    return data?.user ?? null;
  } catch (error) {
    if (isAuthSessionMissingError(error)) {
      return null;
    }
    console.error("[MyShelf] getCurrentUser failed", error);
    return null;
  }
}
