/**
 * IGDB / Twitch Client Credentials（サーバー専用）
 * Client Secret・アクセストークンをログやレスポンスに出さないこと。
 */

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
export const IGDB_API_BASE = "https://api.igdb.com/v4";

const FETCH_TIMEOUT_MS = 10000;
/** レート制限（公式: 秒間4）に余裕を持たせる */
const MIN_INTERVAL_MS = 280;
/** 失効の少し前に再取得 */
const TOKEN_EXPIRY_SKEW_MS = 60_000;

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;
let tokenInflight: Promise<string> | null = null;
let lastRequestAtMs = 0;
let requestChain: Promise<void> = Promise.resolve();

function getCredentials():
  | { ok: true; clientId: string; clientSecret: string }
  | { ok: false } {
  const clientId = process.env.IGDB_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.IGDB_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return { ok: false };
  return { ok: true, clientId, clientSecret };
}

export function hasIgdbCredentials(): boolean {
  return getCredentials().ok;
}

async function fetchNewAccessToken(): Promise<string> {
  const creds = getCredentials();
  if (!creds.ok) {
    throw new Error("IGDB credentials are not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "client_credentials",
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Twitch token request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
      token_type?: unknown;
    };

    if (typeof data.access_token !== "string" || !data.access_token) {
      throw new Error("Twitch token response missing access_token");
    }

    const expiresInSec =
      typeof data.expires_in === "number" && Number.isFinite(data.expires_in)
        ? data.expires_in
        : 3600;

    tokenCache = {
      accessToken: data.access_token,
      expiresAtMs: Date.now() + expiresInSec * 1000 - TOKEN_EXPIRY_SKEW_MS,
    };

    return data.access_token;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.expiresAtMs > Date.now() &&
    tokenCache.accessToken
  ) {
    return tokenCache.accessToken;
  }

  if (!tokenInflight) {
    tokenInflight = fetchNewAccessToken().finally(() => {
      tokenInflight = null;
    });
  }

  return tokenInflight;
}

function invalidateAccessToken(): void {
  tokenCache = null;
}

async function waitForRateLimit(): Promise<void> {
  const run = async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAtMs));
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestAtMs = Date.now();
  };

  const next = requestChain.then(run, run);
  requestChain = next.then(
    () => undefined,
    () => undefined
  );
  await next;
}

export type IgdbRequestResult<T> = {
  ok: true;
  status: number;
  data: T;
} | {
  ok: false;
  status: number;
  error: Error;
};

/**
 * IGDB Apicalypse POST。401 時はトークンを一度だけ更新して再試行する。
 */
export async function igdbPost<T = unknown>(
  endpoint: string,
  apicalypseBody: string
): Promise<IgdbRequestResult<T>> {
  const creds = getCredentials();
  if (!creds.ok) {
    return {
      ok: false,
      status: 503,
      error: new Error("IGDB credentials are not configured"),
    };
  }

  const path = endpoint.replace(/^\//, "");
  const url = `${IGDB_API_BASE}/${path}`;

  const doFetch = async (accessToken: string) => {
    await waitForRateLimit();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "Client-ID": creds.clientId,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "text/plain",
        },
        body: apicalypseBody,
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let accessToken = await getAccessToken(false);
    let response = await doFetch(accessToken);

    if (response.status === 401) {
      invalidateAccessToken();
      accessToken = await getAccessToken(true);
      response = await doFetch(accessToken);
    }

    if (response.status === 429) {
      return {
        ok: false,
        status: 429,
        error: new Error("IGDB rate limited"),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: new Error(`IGDB request failed: ${response.status}`),
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, status: response.status, data };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "IGDB request timed out"
        : error instanceof Error
          ? error.message
          : "IGDB request failed";

    return {
      ok: false,
      status: 502,
      error: new Error(message),
    };
  }
}

/** Apicalypse 文字列リテラル用の最低限のエスケープ */
export function escapeApicalypseString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
