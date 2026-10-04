import { isWorkCategory, type WorkCategory } from "@/lib/work";

export const GUEST_SHELF_STORAGE_KEY = "myshelf_guest_items";
export const GUEST_SHELF_EVENT = "myshelf-guest-shelf";

export type GuestWork = {
  id: string;
  title: string;
  category: WorkCategory;
  image_url: string | null;
  imageUrl?: string;
  description: string | null;
  created_at?: string;
  user_id?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function pickCoverUrl(value: {
  imageUrl?: string | null;
  image_url?: string | null;
}) {
  const fromCamel =
    typeof value.imageUrl === "string" ? value.imageUrl.trim() : "";
  const fromSnake =
    typeof value.image_url === "string" ? value.image_url.trim() : "";
  return fromCamel || fromSnake;
}

function parseGuestWork(value: unknown): GuestWork | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const category =
    typeof value.category === "string" && isWorkCategory(value.category)
      ? value.category
      : null;

  if (!id || !title || !category) {
    return null;
  }

  const cover = pickCoverUrl({
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
    image_url: typeof value.image_url === "string" ? value.image_url : null,
  });

  return {
    id,
    title,
    category,
    image_url: cover || null,
    imageUrl: cover || undefined,
    description: typeof value.description === "string" ? value.description : null,
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    user_id: null,
  };
}

export function isGuestWorkId(id: string) {
  return id.startsWith("guest-");
}

export function readGuestShelf(): GuestWork[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(GUEST_SHELF_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(parseGuestWork)
      .filter((work): work is GuestWork => Boolean(work));
  } catch (error) {
    console.error("[MyShelf] guest shelf read failed", error);
    return [];
  }
}

function notifyGuestShelfUpdated() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(GUEST_SHELF_EVENT));
}

export function writeGuestShelf(works: GuestWork[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GUEST_SHELF_STORAGE_KEY, JSON.stringify(works));
  notifyGuestShelfUpdated();
}

export function addGuestWork(input: {
  title: string;
  category: WorkCategory;
  imageUrl?: string | null;
  image_url?: string | null;
  description?: string | null;
}): GuestWork {
  const cover = pickCoverUrl(input);
  const work: GuestWork = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `guest-${crypto.randomUUID()}`
        : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title: input.title.trim(),
    category: input.category,
    image_url: cover || null,
    imageUrl: cover || undefined,
    description: input.description?.trim() || null,
    created_at: new Date().toISOString(),
    user_id: null,
  };

  writeGuestShelf([work, ...readGuestShelf()]);
  return work;
}

export function removeGuestWork(id: string) {
  writeGuestShelf(readGuestShelf().filter((work) => work.id !== id));
}

export function guestShelfHasTitle(title: string, category: WorkCategory) {
  const needle = title.trim().toLowerCase();
  return readGuestShelf().some(
    (work) => work.category === category && work.title.trim().toLowerCase() === needle,
  );
}
