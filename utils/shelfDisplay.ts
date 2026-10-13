import type { MediaItem, MediaType } from "../types/media";
import type { Profile } from "../types/profile";

export const SHELF_TYPE_LABEL: Record<string, string> = {
  book: "本",
  manga: "漫画",
  movie: "映画",
  music: "音楽",
  game: "ゲーム",
  anime: "アニメ",
  drama: "ドラマ",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidAuthUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** 公開表示名のフォールバック（全画面共通） */
export const UNSET_DISPLAY_NAME = "名前未設定";

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 30;

type PublicDisplayNameSource = {
  display_name?: string | null;
  /** 表示には使わない。登録時に email ローカル部が display_name へミラーされた検出用 */
  username?: string | null;
};

/**
 * 公開表示名の解決。
 * - 表示に使うのは display_name の値だけ
 * - username / email / UUID を表示値として採用しない
 * - display_name が空、メール形式、または username と同一（レガシーミラー）なら未設定扱い
 */
export function resolvePublicDisplayName(args: {
  displayName?: string | null;
  usernameForLegacyCheck?: string | null;
}): string {
  const name = (args.displayName ?? "").trim();
  if (!name) return UNSET_DISPLAY_NAME;

  // メールアドレスそのものは公開表示しない
  if (name.includes("@")) return UNSET_DISPLAY_NAME;

  // 登録時に email の @ 前が display_name と username の両方へ入ったケースを未設定扱い
  const legacyUsername = (args.usernameForLegacyCheck ?? "").trim();
  if (legacyUsername && name === legacyUsername) {
    return UNSET_DISPLAY_NAME;
  }

  return name;
}

/** プロフィール行から公開表示名を得る（全画面共通） */
export function getPublicDisplayName(
  profile: PublicDisplayNameSource | null | undefined
): string {
  return resolvePublicDisplayName({
    displayName: profile?.display_name,
    usernameForLegacyCheck: profile?.username,
  });
}

/** @deprecated getPublicDisplayName を使う */
export function getShelfOwnerLabel(profile: Profile): string {
  return getPublicDisplayName(profile);
}

/** 保存前の正規化・検証。成功時は trim 済み文字列 */
export function normalizeDisplayNameInput(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (value.length < DISPLAY_NAME_MIN_LENGTH) {
    return {
      ok: false,
      error: `表示名は${DISPLAY_NAME_MIN_LENGTH}文字以上で入力してください。`,
    };
  }
  if (value.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内にしてください。`,
    };
  }
  return { ok: true, value };
}

export function mapDbItemToMediaItem(row: {
  id: string;
  title: string;
  category?: string | null;
  creator?: string | null;
  image_url?: string | null;
  created_at?: string | null;
}): MediaItem {
  return {
    id: row.id,
    title: row.title,
    type: (row.category ?? "book") as MediaType,
    creator: row.creator ?? null,
    imageUrl: row.image_url ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

export function filterAndSortShelfItems(
  items: MediaItem[],
  options: {
    searchQuery: string;
    categoryFilter: string;
    sortOrder: string;
  }
): MediaItem[] {
  const query = options.searchQuery.trim().toLowerCase();

  return [...items]
    .sort((a, b) => {
      if (options.sortOrder === "title") {
        return a.title.localeCompare(b.title, "ja");
      }

      const dateA = new Date(a.createdAt ?? 0).getTime();
      const dateB = new Date(b.createdAt ?? 0).getTime();

      if (options.sortOrder === "newest") {
        return dateB - dateA;
      }

      if (options.sortOrder === "oldest") {
        return dateA - dateB;
      }

      return 0;
    })
    .filter(
      (item) =>
        options.categoryFilter === "all" || item.type === options.categoryFilter
    )
    .filter(
      (item) =>
        !query ||
        item.title.toLowerCase().includes(query) ||
        (item.creator ?? "").toLowerCase().includes(query)
    );
}
