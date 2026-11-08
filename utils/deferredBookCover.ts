/**
 * 表紙未設定のまま棚へ追加した本へ、後から表紙URLを安全に反映するための判定。
 * DBスキーマ変更なし（既存 image_url の空のみ更新）。
 */

export type DeferredBookCoverPending = {
  shelfItemId: string;
  searchResultId: string;
  title: string;
  creator: string;
  isbns: string[];
  ownerUserId: string;
};

export function isBlankImageUrl(value: string | null | undefined): boolean {
  return (value ?? "").trim() === "";
}

/**
 * 後から表紙を棚へ書くか。すべて満たすときのみ true。
 * - 所有者一致
 * - 棚レコードがある場合は id / カテゴリ / 画像未設定を確認
 * - shelfItem がまだローカルに無い場合は pending+所有者のみで通し、
 *   削除・画像済みの最終判定は DB の条件付き UPDATE に委ねる
 * - 反映用URLが有効
 */
export function shouldApplyDeferredBookCover(args: {
  pending: DeferredBookCoverPending | null | undefined;
  currentUserId: string | null | undefined;
  shelfItem: {
    id: string;
    type?: string;
    category?: string;
    imageUrl?: string | null;
    image_url?: string | null;
    user_id?: string | null;
  } | null;
  coverUrl: string;
}): boolean {
  const { pending, currentUserId, shelfItem, coverUrl } = args;
  if (!pending || !currentUserId) return false;
  if (pending.ownerUserId !== currentUserId) return false;
  if (isBlankImageUrl(coverUrl)) return false;

  if (!shelfItem) {
    // 追加直後で state 未反映のとき。削除済みは UPDATE が 0 件になる。
    return true;
  }

  if (shelfItem.id !== pending.shelfItemId) return false;
  if (shelfItem.user_id && shelfItem.user_id !== currentUserId) return false;

  const category = shelfItem.type || shelfItem.category || "";
  if (category !== "book") return false;

  const existing = shelfItem.imageUrl ?? shelfItem.image_url;
  if (!isBlankImageUrl(existing)) return false;

  return true;
}

/** 画像が実際に読めるか（ブラウザ / モック両用のインターフェース） */
export function confirmImageUrlLoads(
  url: string,
  loader: (src: string) => Promise<boolean> = browserImageLoader
): Promise<boolean> {
  if (isBlankImageUrl(url)) return Promise.resolve(false);
  return loader(url);
}

function browserImageLoader(src: string): Promise<boolean> {
  if (typeof Image === "undefined") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}
