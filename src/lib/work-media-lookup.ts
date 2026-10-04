import {
  MEDIA_LOOKUP_NOT_FOUND,
  pickLookupCoverUrl,
  type MediaLookupResult,
} from "@/lib/google-books";
import type { WorkCategory } from "@/lib/work";

function asCatalogItem(value: unknown): MediaLookupResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) {
    return null;
  }

  const rawImage =
    (typeof record.imageUrl === "string" ? record.imageUrl : "") ||
    (typeof record.image_url === "string" ? record.image_url : "");

  const cover = pickLookupCoverUrl({ imageUrl: rawImage, image_url: rawImage });

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : title,
    title,
    authors: typeof record.authors === "string" ? record.authors : "",
    description: typeof record.description === "string" ? record.description : "",
    imageUrl: cover,
    image_url: cover,
  };
}

export type WorkMediaLookupPayload = {
  items: MediaLookupResult[];
  error: string | null;
};

export async function fetchCatalogSearch(
  query: string,
  category: WorkCategory,
): Promise<WorkMediaLookupPayload> {
  try {
    const response = await fetch(
      `/api/catalog/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as {
      items?: unknown;
      error?: string | null;
    };
    const items = Array.isArray(payload.items)
      ? payload.items
          .map(asCatalogItem)
          .filter((item): item is MediaLookupResult => Boolean(item))
      : [];
    if (items.length === 0) {
      return {
        items: [],
        error: payload.error?.trim() || MEDIA_LOOKUP_NOT_FOUND,
      };
    }
    return { items, error: null };
  } catch (error) {
    console.error("[MyShelf] catalog search failed", error);
    return { items: [], error: MEDIA_LOOKUP_NOT_FOUND };
  }
}

export async function fetchWorkMediaLookup(
  title: string,
  category: WorkCategory,
): Promise<WorkMediaLookupPayload> {
  try {
    const response = await fetch(
      `/api/works/lookup?title=${encodeURIComponent(title)}&category=${encodeURIComponent(category)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as {
      items?: MediaLookupResult[];
      error?: string | null;
    };
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      return {
        items: [],
        error: payload.error?.trim() || MEDIA_LOOKUP_NOT_FOUND,
      };
    }
    return { items, error: null };
  } catch (error) {
    console.error("[MyShelf] work media lookup failed", error);
    return { items: [], error: MEDIA_LOOKUP_NOT_FOUND };
  }
}
