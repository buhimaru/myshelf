import { NextRequest } from "next/server";

import { mapGoogleBooksItems, rankBookLookupResults } from "@/lib/google-books";

function getGoogleBooksApiKey() {
  return (
    process.env.GOOGLE_BOOKS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY?.trim() ||
    ""
  );
}

function buildGoogleBooksUrl(query: string, apiKey: string) {
  const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("langRestrict", "ja");
  endpoint.searchParams.set("maxResults", "10");
  if (apiKey) {
    endpoint.searchParams.set("key", apiKey);
  }
  return endpoint;
}

async function fetchGoogleBooks(query: string, apiKey: string) {
  const endpoint = buildGoogleBooksUrl(query, apiKey);
  console.log("[MyShelf] Google Books request", {
    q: query,
    hasApiKey: Boolean(apiKey),
  });

  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const bodyText = await response.text();

  console.log("[MyShelf] Google Books status", response.status);

  if (!response.ok) {
    console.error("[MyShelf] Google Books error body", bodyText.slice(0, 800));
    return {
      ok: false as const,
      status: response.status,
      items: [],
    };
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(bodyText) as unknown;
  } catch (error) {
    console.error("[MyShelf] Google Books JSON parse failed", error, bodyText.slice(0, 800));
    return {
      ok: false as const,
      status: response.status,
      items: [],
    };
  }

  const totalItems =
    payload && typeof payload === "object" && "totalItems" in payload
      ? Number(payload.totalItems)
      : undefined;
  const mapped = mapGoogleBooksItems(payload);
  console.log("[MyShelf] Google Books result", {
    q: query,
    totalItems,
    mappedCount: mapped.length,
  });

  return {
    ok: true as const,
    status: response.status,
    items: mapped,
  };
}

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title")?.trim() ?? "";

  if (!title) {
    return Response.json(
      { error: "タイトルを入力してください。", items: [] },
      { status: 400 },
    );
  }

  const apiKey = getGoogleBooksApiKey();
  if (!apiKey) {
    console.error(
      "[MyShelf] Google Books API key missing. Set GOOGLE_BOOKS_API_KEY or NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY.",
    );
  }

  try {
    let result = await fetchGoogleBooks(title, apiKey);

    if (result.ok && result.items.length === 0) {
      console.log("[MyShelf] Google Books fallback to intitle query");
      result = await fetchGoogleBooks(`intitle:${title}`, apiKey);
    }

    if (!result.ok) {
      const message =
        result.status === 429
          ? "書籍検索の上限に達しました。しばらく待つか、GOOGLE_BOOKS_API_KEY を設定してください。"
          : "書籍情報の取得に失敗しました。";
      return Response.json({ error: message, items: [] }, { status: 502 });
    }

    const ranked = rankBookLookupResults(result.items, title);
    const items = (ranked.length > 0 ? ranked : result.items).slice(0, 10);

    console.log("[MyShelf] Google Books ranked count", items.length);

    return Response.json({ items });
  } catch (error) {
    console.error("[MyShelf] Google Books lookup failed", error);
    return Response.json(
      { error: "書籍情報の取得中にエラーが発生しました。", items: [] },
      { status: 500 },
    );
  }
}
