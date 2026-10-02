export const WORK_CATEGORIES = ["book", "movie", "anime", "music"] as const;

export type WorkCategory = (typeof WORK_CATEGORIES)[number];

export type Work = {
  id: string;
  title: string;
  category: WorkCategory;
  image_url: string | null;
  description: string | null;
  created_at?: string;
  user_id?: string | null;
  is_public?: boolean;
};

export const CATEGORY_LABELS: Record<WorkCategory, string> = {
  book: "本",
  movie: "映画",
  anime: "アニメ",
  music: "音楽",
};

export type FilterCategory = "all" | WorkCategory;

export const CATEGORY_FILTERS: { value: FilterCategory; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "book", label: "本" },
  { value: "movie", label: "映画" },
  { value: "anime", label: "アニメ" },
  { value: "music", label: "音楽" },
];

export function isWorkCategory(value: string): value is WorkCategory {
  return WORK_CATEGORIES.includes(value as WorkCategory);
}

export type WorkWritePayload = {
  title: string;
  category: WorkCategory;
  image_url: string | null;
  description: string | null;
  user_id: string;
  is_public: boolean;
};

export function buildWorkWritePayload(input: {
  title: string;
  category: string;
  imageUrl: string;
  description: string;
  userId: string;
  isPublic?: boolean;
}): WorkWritePayload {
  if (!isWorkCategory(input.category)) {
    throw new Error(`不正なカテゴリです: ${input.category}`);
  }

  return {
    title: input.title.trim(),
    category: input.category,
    image_url: input.imageUrl.trim() || null,
    description: input.description.trim() || null,
    user_id: input.userId,
    is_public: input.isPublic ?? true,
  };
}

export function formatSupabaseError(error: {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  const parts = [error.message];
  if (error.code) {
    parts.push(`code: ${error.code}`);
  }
  if (error.details) {
    parts.push(error.details);
  }
  if (error.hint) {
    parts.push(error.hint);
  }

  const detail = parts.join(" / ");

  if (error.message.includes("row-level security") || error.code === "42501") {
    return `${detail} （supabase/schema.sql を SQL Editor で実行し、insert/update/delete を許可してください）`;
  }

  return detail;
}

export function logSupabaseError(action: string, payload: unknown, error: unknown) {
  console.error(`[MyShelf] ${action} failed`, {
    payload,
    error,
  });
}
