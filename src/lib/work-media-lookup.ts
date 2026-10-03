import {
  MEDIA_LOOKUP_NOT_FOUND,
  type MediaLookupResult,
} from "@/lib/google-books";
import type { WorkCategory } from "@/lib/work";

export type WorkMediaLookupPayload = {
  items: MediaLookupResult[];
  error: string | null;
};

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
