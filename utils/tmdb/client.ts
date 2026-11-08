/**
 * TMDb API v3（サーバー専用）。
 * APIキーをログ・レスポンス・クライアントへ出さないこと。
 */

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const FETCH_TIMEOUT_MS = 10000;
const MIN_INTERVAL_MS = 250;

let lastRequestAtMs = 0;
let requestChain: Promise<void> = Promise.resolve();

export function hasTmdbCredentials(): boolean {
  return Boolean(process.env.TMDB_API_KEY?.trim());
}

function getApiKey(): string | null {
  const key = process.env.TMDB_API_KEY?.trim() ?? "";
  return key || null;
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

export type TmdbRequestResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: Error };

export async function tmdbGet<T = unknown>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<TmdbRequestResult<T>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: new Error("TMDb credentials are not configured"),
    };
  }

  const url = new URL(`${TMDB_API_BASE}/${path.replace(/^\//, "")}`);
  url.searchParams.set("api_key", apiKey);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  await waitForRateLimit();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 429) {
      return {
        ok: false,
        status: 429,
        error: new Error("TMDb rate limited"),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: new Error(`TMDb request failed: ${response.status}`),
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, status: response.status, data };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "TMDb request timed out"
        : error instanceof Error
          ? error.message
          : "TMDb request failed";
    return { ok: false, status: 502, error: new Error(message) };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function tmdbPosterUrl(
  posterPath: string | null | undefined,
  size: "w185" | "w342" | "w500" = "w342"
): string {
  if (!posterPath || typeof posterPath !== "string") return "";
  if (!posterPath.startsWith("/")) return "";
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}

export const TMDB_ATTRIBUTION = {
  text: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
  logoUrl: "/tmdb/tmdb-logo-blue-short.svg",
  homeUrl: "https://www.themoviedb.org",
  provider: "TMDB",
} as const;
