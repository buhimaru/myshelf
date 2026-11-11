"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { User } from "@supabase/supabase-js";
import { mediaItems } from "../data/media";
import type { MediaItem, MediaType } from "../types/media";
import { trackAdFunnelEvent } from "../utils/adFunnel/track";
import { createClient } from "../utils/supabase/client";
import { formatAuthErrorMessage } from "../utils/supabase/authMessages";
import {
  buildEmailConfirmRedirectTo,
  claimGuestUpgradeComplete,
  clearAllRegistrationUpgradeState,
  consumeEmailConfirmReturn,
  EMAIL_CONFIRM_POLL_MS,
  emailConfirmRedirectHint,
  getConfiguredPublicSiteOrigin,
  getEmailConfirmPending,
  getPendingForUser,
  isLoopbackOrigin,
  planEmailConfirmRedirect,
  setEmailConfirmPending,
  type RegistrationNoticeKind,
} from "../utils/supabase/registrationNotice";
import ShelfConnections from "./ShelfConnections";
import ShelfDisplayNameSettings from "./ShelfDisplayNameSettings";
import ShelfFollowRequests from "./ShelfFollowRequests";
import { ShelfModalOrInline } from "./ShelfSettingsModal";
import ShelfShareButton from "./ShelfShareButton";
import ShelfVisibilitySettings from "./ShelfVisibilitySettings";
import {
  DESCRIPTION_MAX_LENGTH,
  normalizeDescriptionInput,
  readDescription,
  filterShelfItemsInAdditionOrder,
} from "../utils/shelfDisplay";
import {
  confirmImageUrlLoads,
  isBlankImageUrl,
  shouldApplyDeferredBookCover,
  type DeferredBookCoverPending,
} from "../utils/deferredBookCover";
import BookPaperbackCover from "./BookPaperbackCover";
import BrandLogoLink from "./BrandLogoLink";
import ImageShelf from "./ImageShelf";
import ShelfItemDetail from "./ShelfItemDetail";
import { useVisualViewportHeight } from "./useVisualViewportHeight";
import {
  formatCreatorWithRole,
  parseStoredCreatorCredit,
} from "../utils/tmdb/credits";
import {
  formatBulkDeleteMessage,
  summarizeBulkDelete,
} from "../utils/bulkDeleteItems";

type ApiSearchGenre =
  | "book"
  | "manga"
  | "movie"
  | "anime"
  | "drama"
  | "music"
  | "game";
type MusicSearchKind = "all" | "album" | "single" | "song";

type ShelfAppProps = {
  /** page.tsx で認証確定済みのユーザー（匿名含む） */
  initialUser: User;
};

export default function ShelfApp({ initialUser }: ShelfAppProps) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(initialUser);
  // 親で確定済みのため、初期表示からアカウントUIを出してよい
  const [authReady, setAuthReady] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authFormMessage, setAuthFormMessage] = useState("");
  const [registrationNotice, setRegistrationNotice] =
    useState<RegistrationNoticeKind | null>(null);
  /** onAuthStateChange でアカウント切替を検出するための直前ユーザー */
  const previousAuthUserRef = useRef<User | null>(initialUser);
  /** モーダル表示直後、開いたクリックの mouseup が背景に当たって即閉じるのを防ぐ */
  const authModalIgnoreCloseUntilRef = useRef(0);
  const [showLoopbackConfirmHint] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      isLoopbackOrigin(window.location.origin) &&
      !getConfiguredPublicSiteOrigin()
    );
  });
  const [showForm, setShowForm] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<MediaType | "">("");
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  /** 詳細モーダル内で編集中（ページ上部フォームへは遷移しない） */
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  /** 通常棚の複数選択削除（作品 ID で跨ページ保持） */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const bulkDeletingRef = useRef(false);
  const [items, setItems] = useState<typeof mediaItems>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [apiSearchGenre, setApiSearchGenre] = useState<ApiSearchGenre>("book");
  const [apiSearchQuery, setApiSearchQuery] = useState("");
  const [apiSearchResults, setApiSearchResults] = useState<any[]>([]);
  const [apiSearchLoading, setApiSearchLoading] = useState(false);
  const [apiSearchError, setApiSearchError] = useState("");
  const [apiHasSearched, setApiHasSearched] = useState(false);
  const [addingResultKey, setAddingResultKey] = useState<string | null>(null);
  const [apiAddMessage, setApiAddMessage] = useState("");
  const [apiAddError, setApiAddError] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [musicArtist, setMusicArtist] = useState("");
  const [musicKind, setMusicKind] = useState<MusicSearchKind>("all");
  const [musicNextOffset, setMusicNextOffset] = useState<number | null>(null);
  const [musicLoadingMore, setMusicLoadingMore] = useState(false);
  const [musicMoreError, setMusicMoreError] = useState("");
  /** ゲーム検索の追加ページ（音楽と同様の「もっと見る」） */
  const [gameNextOffset, setGameNextOffset] = useState<number | null>(null);
  const [gameLoadingMore, setGameLoadingMore] = useState(false);
  const [gameMoreError, setGameMoreError] = useState("");
  /** 本の著者検索の追加ページ（NDL idx） */
  const [bookNextOffset, setBookNextOffset] = useState<number | null>(null);
  const [bookLoadingMore, setBookLoadingMore] = useState(false);
  const [bookMoreError, setBookMoreError] = useState("");
  const [failedMusicCoverIds, setFailedMusicCoverIds] = useState<Set<string>>(
    () => new Set()
  );
  /** 楽曲ジャケット候補の現在位置。失敗したURLは保存しない */
  const [musicCoverIndexes, setMusicCoverIndexes] = useState<
    Record<string, number>
  >({});
  /** 楽曲のみ。onLoad で確認できたジャケットURL。録音IDごと */
  const [confirmedMusicCoverUrls, setConfirmedMusicCoverUrls] = useState<
    Record<string, string>
  >({});
  /** 本: onLoad で確認できた表紙URLだけを保存に使う */
  const [confirmedBookCoverUrls, setConfirmedBookCoverUrls] = useState<
    Record<string, string>
  >({});
  const [failedBookCoverIds, setFailedBookCoverIds] = useState<Set<string>>(
    () => new Set()
  );
  /** 本: 表紙API問い合わせ中の作品ID */
  const [pendingBookCoverIds, setPendingBookCoverIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bookSearchAttribution, setBookSearchAttribution] = useState<{
    text: string;
    license: string;
    licenseUrl: string;
    provider: string;
    organization: string;
  } | null>(null);
  /** TMDb 映画・アニメ・ドラマ検索時の必須クレジット */
  const [tmdbSearchAttribution, setTmdbSearchAttribution] = useState<{
    text: string;
    logoUrl: string;
    homeUrl: string;
  } | null>(null);
  /** ドラマ／TVアニメ: 作品全体とシーズン選択 */
  const [tmdbPickerResultKey, setTmdbPickerResultKey] = useState<string | null>(
    null
  );
  const [tmdbPickerLoading, setTmdbPickerLoading] = useState(false);
  const [tmdbPickerError, setTmdbPickerError] = useState("");
  const [tmdbPickerOptions, setTmdbPickerOptions] = useState<any[]>([]);
  const tmdbPickerRequestIdRef = useRef(0);
  const apiSearchRequestIdRef = useRef(0);
  /** 同一作品への表紙重複問い合わせ防止（検索リクエスト単位） */
  const bookCoverRequestedIdsRef = useRef<Set<string>>(new Set());
  /** 表紙未設定のまま追加した本: shelfItemId → 後追い反映メタ */
  const pendingDeferredBookCoversRef = useRef<
    Map<string, DeferredBookCoverPending>
  >(new Map());
  /** 検索結果ID → 後追い対象の棚ID */
  const deferredBookCoverBySearchIdRef = useRef<Map<string, Set<string>>>(
    new Map()
  );
  /** 棚IDへの表紙反映 in-flight / 完了済み（重複UPDATE防止） */
  const deferredBookCoverClaimedRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef(items);
  const userRef = useRef(user);
  itemsRef.current = items;
  userRef.current = user;

  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("myshelf-search-query") || "";
  });
  const [categoryFilter, setCategoryFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem("myshelf-category-filter") || "all";
  });
  const [sortOrder, setSortOrder] = useState(() => {
    if (typeof window === "undefined") return "newest";
    return localStorage.getItem("myshelf-sort-order") || "newest";
  });
  const resetMusicResultView = () => {
    apiSearchRequestIdRef.current += 1;
    setApiSearchResults([]);
    setApiSearchLoading(false);
    setApiSearchError("");
    setApiHasSearched(false);
    setAddingResultKey(null);
    setMusicNextOffset(null);
    setMusicLoadingMore(false);
    setMusicMoreError("");
    setGameNextOffset(null);
    setGameLoadingMore(false);
    setGameMoreError("");
    setBookNextOffset(null);
    setBookLoadingMore(false);
    setBookMoreError("");
    setFailedMusicCoverIds(new Set());
    setMusicCoverIndexes({});
    setConfirmedMusicCoverUrls({});
    setConfirmedBookCoverUrls({});
    setFailedBookCoverIds(new Set());
    setPendingBookCoverIds(new Set());
    setBookSearchAttribution(null);
    setTmdbSearchAttribution(null);
    bookCoverRequestedIdsRef.current = new Set();
  };

  const resetApiSearch = () => {
    resetMusicResultView();
    setApiSearchQuery("");
    setMusicTitle("");
    setMusicArtist("");
    setMusicKind("all");
    setApiAddMessage("");
    setApiAddError("");
    setTmdbPickerResultKey(null);
    setTmdbPickerLoading(false);
    setTmdbPickerError("");
    setTmdbPickerOptions([]);
    tmdbPickerRequestIdRef.current += 1;
  };

  /** キーワードと結果だけ消す。ジャンル（と音楽の種類）は維持。 */
  const clearApiSearchQueryAndResults = () => {
    resetMusicResultView();
    setApiSearchQuery("");
    setMusicTitle("");
    setMusicArtist("");
    setApiAddMessage("");
    setApiAddError("");
    setTmdbPickerResultKey(null);
    setTmdbPickerLoading(false);
    setTmdbPickerError("");
    setTmdbPickerOptions([]);
    tmdbPickerRequestIdRef.current += 1;
  };

  /** 検索結果だけ折りたたむ。ジャンル・キーワード・アーティスト名などは保持。 */
  const collapseApiSearchResults = () => {
    resetMusicResultView();
    setApiAddMessage("");
    setApiAddError("");
    setTmdbPickerResultKey(null);
    setTmdbPickerLoading(false);
    setTmdbPickerError("");
    setTmdbPickerOptions([]);
    tmdbPickerRequestIdRef.current += 1;
    window.requestAnimationFrame(() => {
      document
        .getElementById("my-shelf-compose")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const needsTmdbSeasonPicker = (item: {
    media?: unknown;
  }): boolean => {
    if (apiSearchGenre !== "anime" && apiSearchGenre !== "drama") {
      return false;
    }
    return item.media === "tv";
  };

  const openTmdbSeasonPicker = async (
    item: any,
    resultKey: string
  ): Promise<void> => {
    if (addingResultKey) return;

    if (tmdbPickerResultKey === resultKey && tmdbPickerOptions.length > 0) {
      setTmdbPickerResultKey(null);
      setTmdbPickerError("");
      return;
    }

    const tmdbId = Number(item.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      setTmdbPickerResultKey(resultKey);
      setTmdbPickerOptions([]);
      setTmdbPickerError("作品IDを取得できませんでした");
      return;
    }

    const requestId = tmdbPickerRequestIdRef.current + 1;
    tmdbPickerRequestIdRef.current = requestId;
    setTmdbPickerResultKey(resultKey);
    setTmdbPickerLoading(true);
    setTmdbPickerError("");
    setTmdbPickerOptions([]);
    setApiAddError("");

    try {
      const params = new URLSearchParams({
        id: String(tmdbId),
        kind: apiSearchGenre === "anime" ? "anime" : "drama",
      });
      if (typeof item.title === "string" && item.title.trim()) {
        params.set("title", item.title.trim());
      }
      if (typeof item.imageUrl === "string" && item.imageUrl.trim()) {
        params.set("imageUrl", item.imageUrl.trim());
      }
      if (typeof item.year === "string" && item.year.trim()) {
        params.set("year", item.year.trim());
      }

      const response = await fetch(`/api/tv-options?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (tmdbPickerRequestIdRef.current !== requestId) return;

      if (!response.ok) {
        setTmdbPickerOptions([]);
        setTmdbPickerError(
          typeof data.error === "string" && data.error
            ? data.error
            : "シーズン情報の取得に失敗しました"
        );
        return;
      }

      const options = Array.isArray(data.options) ? data.options : [];
      setTmdbPickerOptions(options);
      if (options.length === 0) {
        setTmdbPickerError("登録できるシーズンが見つかりませんでした");
      }

      if (data.attribution && typeof data.attribution === "object") {
        setTmdbSearchAttribution({
          text: String(data.attribution.text ?? ""),
          logoUrl: String(
            data.attribution.logoUrl ?? "/tmdb/tmdb-logo-blue-short.svg"
          ),
          homeUrl: String(
            data.attribution.homeUrl ?? "https://www.themoviedb.org"
          ),
        });
      }

      // 検索一覧の制作者も、詳細から取れた情報で埋める（空のときは埋めない）
      const creator =
        typeof data.creator === "string" ? data.creator.trim() : "";
      const creatorRole =
        typeof data.creatorRole === "string" ? data.creatorRole : "";
      const creatorRoleLabel =
        typeof data.creatorRoleLabel === "string"
          ? data.creatorRoleLabel.trim()
          : "";
      if (creator) {
        setApiSearchResults((prev) =>
          prev.map((row, index) => {
            const key = `${row.id ?? "item"}-${index}`;
            if (key !== resultKey) return row;
            return { ...row, creator, creatorRole, creatorRoleLabel };
          })
        );
      }
    } catch {
      if (tmdbPickerRequestIdRef.current !== requestId) return;
      setTmdbPickerOptions([]);
      setTmdbPickerError("シーズン情報の取得に失敗しました");
    } finally {
      if (tmdbPickerRequestIdRef.current === requestId) {
        setTmdbPickerLoading(false);
      }
    }
  };

  const resetComposeFields = () => {
    setEditingId(null);
    setTitle("");
    setCreator("");
    setDescription("");
    setType("");
    setImageUrl("");
    setError("");
    setShowManualForm(false);
  };

  /** 手入力フォームだけ閉じる。検索ジャンル・キーワード・結果は触らない。 */
  const clearComposeDraft = () => {
    setTitle("");
    setCreator("");
    setDescription("");
    setType("");
    setImageUrl("");
    setEditingId(null);
    setError("");
  };

  const isComposeDirtyAgainst = (original: MediaItem | undefined) => {
    if (original) {
      return (
        title.trim() !== original.title ||
        (creator.trim() || "") !== (original.creator ?? "") ||
        (description.trim() || "") !== (original.description ?? "") ||
        (imageUrl.trim() || "") !== (original.imageUrl ?? "") ||
        type !== original.type
      );
    }
    return Boolean(
      title.trim() ||
        creator.trim() ||
        description.trim() ||
        imageUrl.trim() ||
        type
    );
  };

  const closeManualForm = () => {
    if (editingId) {
      const original = items.find((item) => item.id === editingId);
      if (
        isComposeDirtyAgainst(original) &&
        !window.confirm("編集内容を破棄して手入力フォームを閉じますか？")
      ) {
        return;
      }
      clearComposeDraft();
      setShowManualForm(false);
      return;
    }

    // 新規手入力の下書きは state に残し、再オープンで復元する（検索は独立）
    setError("");
    setShowManualForm(false);
  };

  const insertItem = async (payload: {
    title: string;
    creator: string | null;
    type: MediaType;
    imageUrl: string;
    description?: string | null;
  }): Promise<
    { ok: true; id: string } | { ok: false; error: string }
  > => {
    if (!user) {
      return { ok: false, error: "ログインしてください" };
    }

    const trimmedTitle = payload.title.trim();
    if (trimmedTitle === "") {
      return { ok: false, error: "作品名を入力してください" };
    }

    // 追加前が0件のときだけ「初作品」候補（サーバー側でも件数検証する）
    const wasEmptyShelf = itemsRef.current.length === 0;

    const { data, error: insertError } = await supabase
      .from("items")
      .insert({
        title: trimmedTitle,
        category: payload.type,
        creator: payload.creator,
        image_url: payload.imageUrl,
        description: payload.description ?? null,
        user_id: user.id,
      })
      .select()
      .single();

    if (insertError) {
      return { ok: false, error: insertError.message };
    }

    const mapped = {
      ...data,
      type: data.category,
      imageUrl: data.image_url,
      description: readDescription(data.description),
      createdAt: data.created_at,
    };
    // 後追い表紙が setState 完了前に走っても参照できるよう同期更新
    itemsRef.current = [...itemsRef.current, mapped];
    setItems(itemsRef.current);

    if (wasEmptyShelf) {
      trackAdFunnelEvent("first_item");
    }

    return { ok: true, id: String(data.id) };
  };

  const clearDeferredBookCover = (shelfItemId: string) => {
    const pending = pendingDeferredBookCoversRef.current.get(shelfItemId);
    pendingDeferredBookCoversRef.current.delete(shelfItemId);
    if (!pending) return;
    const set = deferredBookCoverBySearchIdRef.current.get(
      pending.searchResultId
    );
    if (!set) return;
    set.delete(shelfItemId);
    if (set.size === 0) {
      deferredBookCoverBySearchIdRef.current.delete(pending.searchResultId);
    }
  };

  const registerDeferredBookCover = (pending: DeferredBookCoverPending) => {
    pendingDeferredBookCoversRef.current.set(pending.shelfItemId, pending);
    const existing =
      deferredBookCoverBySearchIdRef.current.get(pending.searchResultId) ??
      new Set<string>();
    existing.add(pending.shelfItemId);
    deferredBookCoverBySearchIdRef.current.set(
      pending.searchResultId,
      existing
    );
  };

  /**
   * 画像未設定の自棚レコードだけ image_url を埋める。
   * 条件付きUPDATE + 事前判定で手動画像・削除済み・他ユーザーを守る。
   */
  const applyDeferredBookCoverToShelf = async (
    shelfItemId: string,
    coverUrl: string
  ): Promise<boolean> => {
    const trimmedUrl = coverUrl.trim();
    if (isBlankImageUrl(trimmedUrl)) return false;
    if (deferredBookCoverClaimedRef.current.has(shelfItemId)) return false;

    const currentUser = userRef.current;
    const pending = pendingDeferredBookCoversRef.current.get(shelfItemId);
    const localItem =
      itemsRef.current.find((item) => item.id === shelfItemId) ?? null;

    if (
      !shouldApplyDeferredBookCover({
        pending,
        currentUserId: currentUser?.id,
        shelfItem: localItem
          ? {
              id: localItem.id,
              type: localItem.type,
              imageUrl: localItem.imageUrl,
              user_id: currentUser?.id,
            }
          : null,
        coverUrl: trimmedUrl,
      })
    ) {
      return false;
    }

    deferredBookCoverClaimedRef.current.add(shelfItemId);

    const loadable = await confirmImageUrlLoads(trimmedUrl);
    if (!loadable) {
      deferredBookCoverClaimedRef.current.delete(shelfItemId);
      return false;
    }

    // 読み込み確認中に手動設定・削除された場合を再チェック
    const latest = itemsRef.current.find((item) => item.id === shelfItemId);
    const latestUser = userRef.current;
    if (
      !shouldApplyDeferredBookCover({
        pending: pendingDeferredBookCoversRef.current.get(shelfItemId),
        currentUserId: latestUser?.id,
        shelfItem: latest
          ? {
              id: latest.id,
              type: latest.type,
              imageUrl: latest.imageUrl,
              user_id: latestUser?.id,
            }
          : null,
        coverUrl: trimmedUrl,
      })
    ) {
      deferredBookCoverClaimedRef.current.delete(shelfItemId);
      clearDeferredBookCover(shelfItemId);
      return false;
    }

    if (!latestUser) {
      deferredBookCoverClaimedRef.current.delete(shelfItemId);
      return false;
    }

    const { data, error } = await supabase
      .from("items")
      .update({ image_url: trimmedUrl })
      .eq("id", shelfItemId)
      .eq("user_id", latestUser.id)
      .eq("category", "book")
      .or("image_url.eq.,image_url.is.null")
      .select("id, image_url")
      .maybeSingle();

    if (error) {
      console.error("表紙の後追い反映エラー:", error);
      deferredBookCoverClaimedRef.current.delete(shelfItemId);
      return false;
    }

    // 行なし = 削除済み or 既に画像あり → 上書きも復活もしない
    if (!data) {
      clearDeferredBookCover(shelfItemId);
      return false;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === shelfItemId
          ? { ...item, imageUrl: data.image_url ?? trimmedUrl }
          : item
      )
    );
    clearDeferredBookCover(shelfItemId);
    return true;
  };

  const tryApplyDeferredCoversForSearchResult = async (
    searchResultId: string,
    coverUrl: string
  ) => {
    const shelfIds = [
      ...(deferredBookCoverBySearchIdRef.current.get(searchResultId) ?? []),
    ];
    for (const shelfItemId of shelfIds) {
      await applyDeferredBookCoverToShelf(shelfItemId, coverUrl);
    }
  };

  /** 検索UIが消えても、未設定の棚レコード用に表紙取得を継続する */
  const ensureDeferredBookCoverFollowUp = async (shelfItemId: string) => {
    const pending = pendingDeferredBookCoversRef.current.get(shelfItemId);
    if (!pending) return;
    if (deferredBookCoverClaimedRef.current.has(shelfItemId)) return;

    try {
      const response = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          works: [
            {
              id: pending.searchResultId,
              title: pending.title,
              creator: pending.creator,
              isbns: pending.isbns,
            },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      const coverRow = Array.isArray(data.covers)
        ? data.covers.find(
            (row: { id?: string }) =>
              String(row?.id ?? "") === pending.searchResultId
          )
        : null;
      const imageUrl =
        coverRow && typeof coverRow.imageUrl === "string"
          ? coverRow.imageUrl.trim()
          : "";
      if (!imageUrl) {
        clearDeferredBookCover(shelfItemId);
        return;
      }
      await applyDeferredBookCoverToShelf(shelfItemId, imageUrl);
    } catch (error) {
      console.error("表紙の後追い取得エラー:", error);
      // 失敗時は作品本体を触らない。再試行可能にするため claim は外す
      deferredBookCoverClaimedRef.current.delete(shelfItemId);
    }
  };

  const handleAddFromSearch = async (item: any, resultKey: string) => {
    if (addingResultKey) return;

    const trimmedTitle = (item.title ?? "").trim();
    if (trimmedTitle === "") {
      setApiAddMessage("");
      setApiAddError("作品名がないため追加できません");
      return;
    }

    setAddingResultKey(resultKey);
    setApiAddMessage("");
    setApiAddError("");

    const creatorRaw = (item.creator ?? "").trim();
    const itemId = String(item.id ?? "");
    const coverFailed =
      (apiSearchGenre === "music" && failedMusicCoverIds.has(itemId)) ||
      (apiSearchGenre === "book" && failedBookCoverIds.has(itemId));
    const candidates = Array.isArray(item.imageCandidates)
      ? item.imageCandidates.filter(
          (url: unknown): url is string =>
            typeof url === "string" && url.trim() !== ""
        )
      : [];
    const coverIndex = musicCoverIndexes[itemId] ?? 0;
    const shownCover =
      candidates[coverIndex] ??
      (typeof item.imageUrl === "string" ? item.imageUrl : "");
    // 楽曲(song)・本は onLoad 確認済みURLだけ。未確認・全失敗は空文字。
    const imageUrlForInsert =
      apiSearchGenre === "music" && musicKind === "song"
        ? (confirmedMusicCoverUrls[itemId] ?? "").trim()
        : apiSearchGenre === "book"
          ? (confirmedBookCoverUrls[itemId] ?? "").trim()
          : coverFailed
            ? ""
            : shownCover.trim();
    const result = await insertItem({
      title: trimmedTitle,
      creator: creatorRaw === "" ? null : creatorRaw,
      type: apiSearchGenre,
      imageUrl: imageUrlForInsert,
    });

    if (!result.ok) {
      setAddingResultKey(null);
      setApiAddError(result.error);
      return;
    }

    // 本: 表紙未設定で追加した場合、後から見つかった表紙を棚へ反映する
    if (
      apiSearchGenre === "book" &&
      isBlankImageUrl(imageUrlForInsert) &&
      user &&
      itemId
    ) {
      registerDeferredBookCover({
        shelfItemId: result.id,
        searchResultId: itemId,
        title: trimmedTitle,
        creator: creatorRaw,
        isbns: Array.isArray(item.isbns)
          ? item.isbns.filter(
              (value: unknown): value is string =>
                typeof value === "string" && value.trim() !== ""
            )
          : [],
        ownerUserId: user.id,
      });
      // 検索リセットで進行中の表紙取得が中断されても拾えるよう独立フォローアップ
      void ensureDeferredBookCoverFollowUp(result.id);
    }

    // 連続登録用に検索ジャンル・キーワード・結果一覧は残す
    setAddingResultKey(null);
    setApiAddError("");
    setApiAddMessage("棚に追加しました。同じ一覧から続けて選べます。");
    setTmdbPickerResultKey(null);
    setTmdbPickerLoading(false);
    setTmdbPickerError("");
    setTmdbPickerOptions([]);
    tmdbPickerRequestIdRef.current += 1;
  };

  const runMusicSearch = async (args: {
    title: string;
    artist: string;
    kind: MusicSearchKind;
    offset: number;
    append: boolean;
  }) => {
    const requestId = args.append
      ? apiSearchRequestIdRef.current
      : ++apiSearchRequestIdRef.current;

    if (args.append) {
      setMusicLoadingMore(true);
      setMusicMoreError("");
    } else {
      setApiSearchLoading(true);
      setApiSearchResults([]);
      setMusicNextOffset(null);
      setFailedMusicCoverIds(new Set());
      setMusicCoverIndexes({});
      setConfirmedMusicCoverUrls({});
      setApiSearchError("");
      setMusicMoreError("");
      setApiHasSearched(false);
    }
    setAddingResultKey(null);
    setApiAddMessage("");
    setApiAddError("");

    const params = new URLSearchParams();
    if (args.title) params.set("title", args.title);
    if (args.artist) params.set("artist", args.artist);
    params.set("kind", args.kind);
    if (args.offset > 0) params.set("offset", String(args.offset));

    try {
      const response = await fetch(`/api/music?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (requestId !== apiSearchRequestIdRef.current) return;
      if (!response.ok) {
        throw new Error("検索に失敗しました");
      }

      const incoming = Array.isArray(data.results) ? data.results : [];
      setApiSearchResults((prev) => {
        if (!args.append) return incoming;
        const seen = new Set(prev.map((item) => String(item.id ?? "")));
        const merged = [...prev];
        for (const item of incoming) {
          const id = String(item?.id ?? "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(item);
        }
        return merged;
      });
      setMusicNextOffset(
        typeof data.nextOffset === "number" ? data.nextOffset : null
      );
      setApiHasSearched(true);
    } catch (searchError) {
      if (requestId !== apiSearchRequestIdRef.current) return;
      console.error("音楽の検索エラー:", searchError);
      if (args.append) {
        setMusicMoreError("追加の取得に失敗しました");
      } else {
        setApiSearchResults([]);
        setMusicNextOffset(null);
        setApiSearchError("検索に失敗しました");
        setApiHasSearched(true);
      }
    } finally {
      if (requestId !== apiSearchRequestIdRef.current) return;
      setApiSearchLoading(false);
      setMusicLoadingMore(false);
    }
  };

  const runGameSearch = async (args: {
    query: string;
    offset: number;
    append: boolean;
  }) => {
    const requestId = args.append
      ? apiSearchRequestIdRef.current
      : ++apiSearchRequestIdRef.current;

    if (args.append) {
      setGameLoadingMore(true);
      setGameMoreError("");
    } else {
      setApiSearchLoading(true);
      setApiSearchResults([]);
      setGameNextOffset(null);
      setApiSearchError("");
      setGameMoreError("");
      setApiHasSearched(false);
    }
    setAddingResultKey(null);
    setApiAddMessage("");
    setApiAddError("");

    const params = new URLSearchParams();
    params.set("q", args.query);
    if (args.offset > 0) params.set("offset", String(args.offset));

    try {
      const response = await fetch(`/api/games?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (requestId !== apiSearchRequestIdRef.current) return;
      if (!response.ok) {
        throw new Error("検索に失敗しました");
      }

      const incoming = Array.isArray(data.results) ? data.results : [];
      setApiSearchResults((prev) => {
        if (!args.append) return incoming;
        const seen = new Set(prev.map((item) => String(item.id ?? "")));
        const merged = [...prev];
        for (const item of incoming) {
          const id = String(item?.id ?? "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(item);
        }
        return merged;
      });
      setGameNextOffset(
        typeof data.nextOffset === "number" ? data.nextOffset : null
      );
      setApiHasSearched(true);
      console.log("gameの検索結果:", incoming);
    } catch (searchError) {
      if (requestId !== apiSearchRequestIdRef.current) return;
      console.error("ゲームの検索エラー:", searchError);
      if (args.append) {
        setGameMoreError("追加の取得に失敗しました");
      } else {
        setApiSearchResults([]);
        setGameNextOffset(null);
        setApiSearchError("検索に失敗しました");
        setApiHasSearched(true);
      }
    } finally {
      if (requestId !== apiSearchRequestIdRef.current) return;
      setApiSearchLoading(false);
      setGameLoadingMore(false);
    }
  };

  const handleApiSearch = async () => {
    setApiAddMessage("");
    setApiAddError("");

    if (apiSearchGenre === "music") {
      const title = musicTitle.trim();
      const artist = musicArtist.trim();
      if (!title && !artist) {
        resetMusicResultView();
        setApiSearchError("作品名かアーティスト名を入力してください");
        return;
      }
      await runMusicSearch({
        title,
        artist,
        kind: musicKind,
        offset: 0,
        append: false,
      });
      return;
    }

    if (!apiSearchQuery.trim()) return;

    if (apiSearchGenre === "game") {
      await runGameSearch({
        query: apiSearchQuery.trim(),
        offset: 0,
        append: false,
      });
      return;
    }

    const requestId = ++apiSearchRequestIdRef.current;
    const endpoint =
      apiSearchGenre === "book"
        ? "/api/books"
        : apiSearchGenre === "manga"
          ? "/api/manga"
          : apiSearchGenre === "movie"
            ? "/api/movies"
            : apiSearchGenre === "anime"
              ? "/api/anime"
              : apiSearchGenre === "drama"
                ? "/api/drama"
                : "/api/music";

    setApiSearchLoading(true);
    setApiSearchResults([]);
    setApiSearchError("");
    setApiHasSearched(false);
    setAddingResultKey(null);
    setApiAddMessage("");
    setApiAddError("");
    setBookNextOffset(null);
    setBookLoadingMore(false);
    setBookMoreError("");
    setConfirmedBookCoverUrls({});
    setFailedBookCoverIds(new Set());
    setPendingBookCoverIds(new Set());
    setBookSearchAttribution(null);
    setTmdbSearchAttribution(null);
    setTmdbPickerResultKey(null);
    setTmdbPickerLoading(false);
    setTmdbPickerError("");
    setTmdbPickerOptions([]);
    tmdbPickerRequestIdRef.current += 1;
    bookCoverRequestedIdsRef.current = new Set();

    try {
      const response = await fetch(
        `${endpoint}?q=${encodeURIComponent(apiSearchQuery)}`
      );

      const data = await response.json().catch(() => ({}));

      if (requestId !== apiSearchRequestIdRef.current) return;

      const apiError =
        typeof data.error === "string" && data.error.trim() !== ""
          ? data.error.trim()
          : "";

      const isTmdbGenre =
        apiSearchGenre === "movie" ||
        apiSearchGenre === "anime" ||
        apiSearchGenre === "drama";

      // 本・TMDb系: 通信障害などを「見つかりませんでした」と取り違えない
      if (
        (apiSearchGenre === "book" || isTmdbGenre) &&
        (!response.ok || apiError)
      ) {
        setApiSearchResults([]);
        setBookNextOffset(null);
        setBookSearchAttribution(null);
        setTmdbSearchAttribution(null);
        setApiSearchError(
          apiError || "検索できませんでした。時間をおいて再試行してください"
        );
        setApiHasSearched(true);
        return;
      }

      if (!response.ok) {
        throw new Error("検索に失敗しました");
      }

      const results = Array.isArray(data.results) ? data.results : [];
      setApiSearchResults(results);
      if (apiSearchGenre === "book") {
        const next =
          typeof data.nextOffset === "number" &&
          Number.isFinite(data.nextOffset) &&
          data.nextOffset > 0
            ? Math.floor(data.nextOffset)
            : null;
        setBookNextOffset(next);
        setBookMoreError("");
      } else {
        setBookNextOffset(null);
      }
      if (
        apiSearchGenre === "book" &&
        data.attribution &&
        typeof data.attribution.text === "string"
      ) {
        setBookSearchAttribution({
          text: data.attribution.text,
          license: String(data.attribution.license ?? "CC BY 4.0"),
          licenseUrl: String(
            data.attribution.licenseUrl ??
              "https://creativecommons.org/licenses/by/4.0/deed.ja"
          ),
          provider: String(data.attribution.provider ?? ""),
          organization: String(data.attribution.organization ?? ""),
        });
        setTmdbSearchAttribution(null);
      } else if (
        isTmdbGenre &&
        data.attribution &&
        typeof data.attribution.text === "string"
      ) {
        setBookSearchAttribution(null);
        setTmdbSearchAttribution({
          text: data.attribution.text,
          logoUrl: String(
            data.attribution.logoUrl ?? "/tmdb/tmdb-logo-blue-short.svg"
          ),
          homeUrl: String(
            data.attribution.homeUrl ?? "https://www.themoviedb.org"
          ),
        });
      } else {
        setBookSearchAttribution(null);
        setTmdbSearchAttribution(null);
      }
      setApiHasSearched(true);
      console.log(`${apiSearchGenre}の検索結果:`, results);

      // 書誌一覧は先に表示し、表紙だけ別途取得する
      if (apiSearchGenre === "book" && results.length > 0) {
        void enrichBookCoversProgressively(
          results,
          requestId,
          apiSearchQuery.trim()
        );
      }
    } catch (searchError) {
      if (requestId !== apiSearchRequestIdRef.current) return;
      console.error(`${apiSearchGenre}の検索エラー:`, searchError);
      setApiSearchResults([]);
      setBookNextOffset(null);
      setApiSearchError(
        apiSearchGenre === "book"
          ? "検索できませんでした。時間をおいて再試行してください"
          : "検索に失敗しました"
      );
      setApiHasSearched(true);
    } finally {
      if (requestId === apiSearchRequestIdRef.current) {
        setApiSearchLoading(false);
      }
    }
  };

  const bookResultDedupeKey = (item: {
    id?: unknown;
    title?: unknown;
    creator?: unknown;
  }) => {
    const id = String(item?.id ?? "").trim();
    if (id) return `id:${id}`;
    const title = String(item?.title ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const creator = String(item?.creator ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    return `tc:${title}::${creator}`;
  };

  /** 著者検索の追加ページを読み込む */
  const loadMoreBookResults = async () => {
    if (apiSearchGenre !== "book") return;
    if (bookNextOffset === null || bookLoadingMore) return;
    const query = apiSearchQuery.trim();
    if (!query) return;

    const requestId = apiSearchRequestIdRef.current;
    const offset = bookNextOffset;
    setBookLoadingMore(true);
    setBookMoreError("");

    try {
      const response = await fetch(
        `/api/books?q=${encodeURIComponent(query)}&offset=${offset}`
      );
      const data = await response.json().catch(() => ({}));
      if (requestId !== apiSearchRequestIdRef.current) return;

      const apiError =
        typeof data.error === "string" && data.error.trim() !== ""
          ? data.error.trim()
          : "";
      if (!response.ok || apiError) {
        setBookMoreError(
          apiError || "追加の結果を読み込めませんでした。再試行してください"
        );
        return;
      }

      const incoming = Array.isArray(data.results) ? data.results : [];
      setApiSearchResults((prev) => {
        const seen = new Set(
          prev.map((row: { id?: unknown; title?: unknown; creator?: unknown }) =>
            bookResultDedupeKey(row)
          )
        );
        const fresh = incoming.filter(
          (row: { id?: unknown; title?: unknown; creator?: unknown }) => {
            const key = bookResultDedupeKey(row);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          }
        );
        if (fresh.length > 0) {
          void enrichBookCoversProgressively(fresh, requestId, query);
        }
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });

      const next =
        typeof data.nextOffset === "number" &&
        Number.isFinite(data.nextOffset) &&
        data.nextOffset > 0
          ? Math.floor(data.nextOffset)
          : null;
      setBookNextOffset(next);
    } catch (error) {
      if (requestId !== apiSearchRequestIdRef.current) return;
      console.error("本の追加読み込みエラー:", error);
      setBookMoreError("追加の結果を読み込めませんでした。再試行してください");
    } finally {
      if (requestId === apiSearchRequestIdRef.current) {
        setBookLoadingMore(false);
      }
    }
  };

  /** 表紙を1件ずつ取得し、見つかった作品から順に imageUrl を反映する */
  const enrichBookCoversProgressively = async (
    results: any[],
    requestId: number,
    query: string
  ) => {
    const MAX_CLIENT_COVERS = 3;
    const norm = (value: string) =>
      value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[【】〔〕［\]\[\]()（）「」『』"'「」]/g, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    const qNorm = norm(query);
    const ranked = [...results].sort((a, b) => {
      const aExact = qNorm && norm(String(a?.title ?? "")) === qNorm ? 1 : 0;
      const bExact = qNorm && norm(String(b?.title ?? "")) === qNorm ? 1 : 0;
      return bExact - aExact;
    });
    const targets = ranked
      .filter((item) => {
        const id = String(item?.id ?? "");
        if (!id) return false;
        if (bookCoverRequestedIdsRef.current.has(id)) return false;
        return true;
      })
      .slice(0, MAX_CLIENT_COVERS);

    for (const item of targets) {
      if (requestId !== apiSearchRequestIdRef.current) return;

      const id = String(item.id ?? "");
      if (!id || bookCoverRequestedIdsRef.current.has(id)) continue;
      bookCoverRequestedIdsRef.current.add(id);

      setPendingBookCoverIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      try {
        const response = await fetch("/api/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            works: [
              {
                id,
                title: String(item.title ?? ""),
                creator: String(item.creator ?? ""),
                isbns: Array.isArray(item.isbns) ? item.isbns : [],
              },
            ],
          }),
        });
        const data = await response.json().catch(() => ({}));
        const stale = requestId !== apiSearchRequestIdRef.current;

        const coverRow = Array.isArray(data.covers)
          ? data.covers.find(
              (row: { id?: string }) => String(row?.id ?? "") === id
            )
          : null;
        const imageUrl =
          coverRow && typeof coverRow.imageUrl === "string"
            ? coverRow.imageUrl.trim()
            : "";

        if (imageUrl) {
          if (!stale) {
            setApiSearchResults((prev) =>
              prev.map((row) =>
                String(row?.id ?? "") === id ? { ...row, imageUrl } : row
              )
            );
          }
          // 検索UIが切り替わっていても、未設定のまま追加済みの棚へは反映する
          await tryApplyDeferredCoversForSearchResult(id, imageUrl);
        }

        if (stale) return;
      } catch (coverError) {
        console.error("表紙の非同期取得エラー:", coverError);
      } finally {
        if (requestId === apiSearchRequestIdRef.current) {
          setPendingBookCoverIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    }
  };

  const handleApiSearchGenreChange = (genre: ApiSearchGenre) => {
    setApiSearchGenre(genre);
    resetMusicResultView();
    setApiAddMessage("");
    setApiAddError("");
    setTmdbPickerResultKey(null);
    setTmdbPickerLoading(false);
    setTmdbPickerError("");
    setTmdbPickerOptions([]);
    tmdbPickerRequestIdRef.current += 1;
  };

  useEffect(() => {
    localStorage.setItem("myshelf-sort-order", sortOrder);
  }, [sortOrder]);
  useEffect(() => {
    localStorage.setItem("myshelf-category-filter", categoryFilter);
  }, [categoryFilter]);
  useEffect(() => {
    localStorage.setItem("myshelf-search-query", searchQuery);
  }, [searchQuery]);

  // 削除・再読込後に存在しない ID を選択から外す。空棚なら選択モードも終了。
  useEffect(() => {
    const alive = new Set(items.map((item) => item.id));
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    if (items.length === 0) {
      setSelectionMode(false);
    }
  }, [items]);

  // 親から渡された確定済みユーザーを反映（ページ再マウント時のチラつき防止）
  useEffect(() => {
    setUser(initialUser);
    setAuthReady(true);
  }, [initialUser.id, initialUser.is_anonymous, initialUser.email]);

  // 以降のログイン・アップグレード・ログアウトのみ購読（初期 getUser は親に任せる）
  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const nextUser = session?.user ?? null;
      const previousUser = previousAuthUserRef.current;
      previousAuthUserRef.current = nextUser;
      setUser(nextUser);
      setAuthReady(true);

      // 別アカウントへ切り替わった場合は昇格通知を出さない
      if (
        previousUser &&
        nextUser &&
        previousUser.id !== nextUser.id
      ) {
        clearAllRegistrationUpgradeState();
        setRegistrationNotice(null);
        setShowAuth(false);
        setAuthFormMessage("");
        return;
      }

      // 同じ userId のゲスト→正式が確認できたときだけ完了案内
      if (
        nextUser &&
        claimGuestUpgradeComplete(nextUser, {
          previousUserId: previousUser?.id ?? null,
          previousWasAnonymous: Boolean(previousUser?.is_anonymous),
        })
      ) {
        setRegistrationNotice("registered");
        setShowAuth(false);
        setAuthFormMessage("");
        trackAdFunnelEvent("registered");
      } else if (nextUser && !nextUser.is_anonymous) {
        // 通常のトークン更新などでは完了バナーを消さない（とじる操作のみ）
        setRegistrationNotice((prev) =>
          prev === "email_pending" || prev === "confirm_login" ? null : prev
        );
      } else if (nextUser?.is_anonymous) {
        const pending = getPendingForUser(nextUser.id);
        if (pending) {
          setRegistrationNotice((prev) =>
            prev === "confirm_login" ? prev : "email_pending"
          );
        } else {
          setRegistrationNotice((prev) =>
            prev === "email_pending" || prev === "registered" ? null : prev
          );
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // メール確認戻り・保留状態を、実際の getUser 結果と照合する
  useEffect(() => {
    let cancelled = false;

    const showConfirmLoginHelp = (pendingEmail?: string) => {
      if (pendingEmail) setEmail(pendingEmail);
      setRegistrationNotice("confirm_login");
      setAuthFormMessage(
        "メール確認が完了しました。この端末ではまだ正式ログインできていないため、登録したメールアドレスとパスワードでログインしてください。同じ棚の作品を引き継いで正式アカウントになります。"
      );
      setShowAuth(true);
    };

    /**
     * 確認待ち中は refreshSession しない（PKCE verifier 消失対策）。
     * getUser で正式化を確認できたあと、JWT 更新のため一度だけ refresh する。
     */
    const applyUpgradedUser = async (serverUser: User) => {
      const previousUser = previousAuthUserRef.current;
      if (
        !claimGuestUpgradeComplete(serverUser, {
          previousUserId: previousUser?.id ?? null,
          previousWasAnonymous: Boolean(previousUser?.is_anonymous),
        })
      ) {
        return false;
      }

      const { data: refreshed } = await supabase.auth.refreshSession();
      if (cancelled) return true;
      const nextUser = refreshed.user ?? refreshed.session?.user ?? serverUser;
      previousAuthUserRef.current = nextUser;
      setUser(nextUser);
      setRegistrationNotice("registered");
      setShowAuth(false);
      setAuthFormMessage("");
      trackAdFunnelEvent("registered");
      return true;
    };

    const reconcile = async () => {
      const fromReturn = consumeEmailConfirmReturn();
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;

      if (error || !data.user) {
        if (fromReturn) {
          const pending = getEmailConfirmPending();
          showConfirmLoginHelp(pending?.email);
        }
        return;
      }

      const current = data.user;
      setUser(current);

      if (!current.is_anonymous) {
        // fromReturn やメール一致だけでは出さない。userId 一致の昇格のみ。
        const upgraded = await applyUpgradedUser(current);
        if (cancelled) return;
        if (!upgraded) {
          setRegistrationNotice((prev) =>
            prev === "registered" ? null : prev
          );
        }
        return;
      }

      // まだゲスト: 確認待ち中の refreshSession はしない。
      // 同一端末の code 交換は createBrowserClient の detectSessionInUrl に任せる。
      if (fromReturn) {
        const pendingBefore = getPendingForUser(current.id);
        // 少し待ってから再取得（同一端末の code 交換完了を待つ）
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        if (cancelled) return;
        const { data: again } = await supabase.auth.getUser();
        if (cancelled) return;
        const againUser = again.user;
        if (
          againUser &&
          !againUser.is_anonymous &&
          pendingBefore &&
          againUser.id === pendingBefore.userId
        ) {
          await applyUpgradedUser(againUser);
          return;
        }
        showConfirmLoginHelp(pendingBefore?.email);
        return;
      }

      if (getPendingForUser(current.id)) {
        setRegistrationNotice("email_pending");
      }
    };

    void reconcile();

    return () => {
      cancelled = true;
    };
  }, [supabase, initialUser.id]);

  // 確認メール待ちの間、定期的に getUser で正式化を検知する（signOut / 待ち中 refresh はしない）
  useEffect(() => {
    if (registrationNotice !== "email_pending") return;

    let cancelled = false;

    const recheck = async () => {
      const pending = getEmailConfirmPending();
      if (!pending) return;

      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;

      if (data.user.is_anonymous || data.user.id !== pending.userId) {
        return;
      }

      const previousUser = previousAuthUserRef.current;
      if (
        !claimGuestUpgradeComplete(data.user, {
          previousUserId: previousUser?.id ?? null,
          previousWasAnonymous: Boolean(previousUser?.is_anonymous),
        })
      ) {
        return;
      }

      // 正式化を確認できたあとだけ JWT を更新
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (cancelled) return;
      const nextUser = refreshed.user ?? refreshed.session?.user ?? data.user;
      previousAuthUserRef.current = nextUser;
      setUser(nextUser);
      setRegistrationNotice("registered");
      setShowAuth(false);
      setAuthFormMessage("");
      trackAdFunnelEvent("registered");
    };

    const onVisible = () => {
      if (document.visibilityState === "hidden") return;
      void recheck();
    };

    void recheck();
    const intervalId = window.setInterval(() => {
      void recheck();
    }, EMAIL_CONFIRM_POLL_MS);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [registrationNotice, supabase]);

  useEffect(() => {
    const loadItems = async () => {
      console.log("loadItems実行", user);
      if (!user) return;
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("user_id", user.id);
      console.log("Supabase data:", data, error);
      if (data) {
        setItems(
          data.map((item) => ({
            ...item,
            type: item.category,
            imageUrl: item.image_url,
            description: readDescription(item.description),
            createdAt: item.created_at,
          }))
        );
      }
      setLoaded(true);
    };
    loadItems();
  }, [user]);
  useEffect(() => {
    if (!loaded) return;
    if (user) return;

    localStorage.setItem("myshelf-items", JSON.stringify(items));
  }, [items, loaded, user]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setSortOrder("newest");
  };

  const cancelDetailEdit = () => {
    if (!detailEditing) return;
    const original = editingId
      ? items.find((entry) => entry.id === editingId)
      : undefined;
    if (
      isComposeDirtyAgainst(original) &&
      !window.confirm("編集内容を破棄して詳細画面に戻りますか？")
    ) {
      return;
    }
    clearComposeDraft();
    setDetailEditing(false);
    setDetailSaving(false);
    setShowManualForm(false);
  };

  const closeDetailModal = () => {
    if (detailEditing) {
      cancelDetailEdit();
      return;
    }
    setDetailItem(null);
  };

  const handleAdd = async () => {
    if (type === "") {
      setError("カテゴリーを選択してください");
      return;
    }
    if (title.trim() === "") {
      setError("作品名を入力してください");
      return;
    }
    setError("");
    if (!user) {
      setError("ログインしてください");
      return;
    }

    const trimmedTitle = title.trim();
    const creatorValue = creator.trim() === "" ? null : creator.trim();
    const imageUrlValue = imageUrl.trim();
    const descriptionResult = normalizeDescriptionInput(description);
    if (!descriptionResult.ok) {
      setError(descriptionResult.error);
      return;
    }
    const descriptionValue = descriptionResult.value;
    const editingInDetail = detailEditing;

    if (editingId) {
      if (editingInDetail) setDetailSaving(true);
      // 手動編集した作品は後追い表紙の対象から外す（上書き防止）
      clearDeferredBookCover(editingId);
      deferredBookCoverClaimedRef.current.add(editingId);
      const { error: updateError } = await supabase
        .from("items")
        .update({
          title: trimmedTitle,
          creator: creatorValue,
          category: type,
          image_url: imageUrlValue,
          description: descriptionValue,
        })
        .eq("id", editingId)
        .eq("user_id", user.id);
      if (updateError) {
        setError(updateError.message);
        if (editingInDetail) setDetailSaving(false);
        return;
      }
      const nextItems = itemsRef.current.map((item) =>
        item.id === editingId
          ? {
              ...item,
              title: trimmedTitle,
              creator: creatorValue,
              type: type,
              imageUrl: imageUrlValue,
              description: descriptionValue,
            }
          : item
      );
      itemsRef.current = nextItems;
      setItems(nextItems);
      clearComposeDraft();
      setShowManualForm(false);
      setShowForm(false);
      setDetailEditing(false);
      setDetailSaving(false);
      return;
    }

    const result = await insertItem({
      title: trimmedTitle,
      creator: creatorValue,
      type,
      imageUrl: imageUrlValue,
      description: descriptionValue,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    clearComposeDraft();
    setShowManualForm(false);
    setShowForm(false);
    setError("");
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("本当にこの作品を削除しますか？");

    if (!confirmed) return;
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) {
      alert("削除に失敗しました: " + error.message);
      return;
    }
    clearDeferredBookCover(id);
    deferredBookCoverClaimedRef.current.add(id);
    const nextItems = itemsRef.current.filter((item) => item.id !== id);
    itemsRef.current = nextItems;
    setItems(nextItems);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDetailItem((current) => (current?.id === id ? null : current));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (bulkDeletingRef.current) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const confirmed = window.confirm(
      `選択した${ids.length}件の作品を削除します。この操作は取り消せません。`
    );
    if (!confirmed) return;

    bulkDeletingRef.current = true;
    setBulkDeleting(true);
    try {
      const { data, error } = await supabase
        .from("items")
        .delete()
        .in("id", ids)
        .select("id");

      if (error) {
        alert("削除に失敗しました: " + error.message);
        return;
      }

      const deletedIds = (data ?? []).map((row) => row.id as string);
      const { succeededIds, failedIds } = summarizeBulkDelete(ids, deletedIds);

      for (const id of succeededIds) {
        clearDeferredBookCover(id);
        deferredBookCoverClaimedRef.current.add(id);
      }

      if (succeededIds.length > 0) {
        const removed = new Set(succeededIds);
        const nextItems = itemsRef.current.filter((item) => !removed.has(item.id));
        itemsRef.current = nextItems;
        setItems(nextItems);
        setDetailItem((current) =>
          current && removed.has(current.id) ? null : current
        );
      }

      alert(formatBulkDeleteMessage(succeededIds.length, failedIds.length));

      if (failedIds.length === 0) {
        exitSelectionMode();
      } else {
        setSelectedIds(new Set(failedIds));
      }
    } finally {
      bulkDeletingRef.current = false;
      setBulkDeleting(false);
    }
  };

  const handleEdit = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;

    // 詳細モーダル内で編集UIへ切り替え（ページ上部へスクロールしない）
    setEditingId(id);
    setTitle(item.title);
    setCreator(item.creator ?? "");
    setDescription(item.description ?? "");
    setType(item.type);
    setImageUrl(item.imageUrl ?? "");
    setError("");
    setShowForm(false);
    setShowManualForm(false);
    setDetailSaving(false);
    setDetailEditing(true);
  };

  const handleSignUp = async () => {
    setAuthFormMessage("");
    const { data: userData } = await supabase.auth.getUser();

    const redirectPlan = planEmailConfirmRedirect(window.location.origin);
    const redirectHint = emailConfirmRedirectHint(redirectPlan);
    const emailRedirectTo = buildEmailConfirmRedirectTo(window.location.origin);

    if (userData.user?.is_anonymous) {
      const { error } = await supabase.auth.updateUser(
        {
          email,
          password,
        },
        { emailRedirectTo }
      );

      if (error) {
        setAuthFormMessage(formatAuthErrorMessage(error, "update"));
        setShowAuth(true);
        return;
      }

      setEmailConfirmPending({
        userId: userData.user.id,
        email: email.trim(),
      });
      setRegistrationNotice("email_pending");
      setAuthFormMessage("");
      setShowAuth(false);
      setPassword("");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (error) {
      setAuthFormMessage(formatAuthErrorMessage(error, "sign_up"));
      setShowAuth(true);
      return;
    }

    setAuthFormMessage(
      [
        "確認メールを送信しました。メール内のリンクから確認したあと、メールアドレスとパスワードでログインしてください。確認が終わるまでは登録は完了していません。",
        redirectHint,
      ]
        .filter(Boolean)
        .join(" ")
    );
    setShowAuth(true);
  };

  const handleSignIn = async () => {
    setAuthFormMessage("");
    const previousUser = user;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthFormMessage(formatAuthErrorMessage(error, "sign_in"));
      setShowAuth(true);
      return;
    }

    if (data.user) {
      previousAuthUserRef.current = data.user;
    }
    setUser(data.user);
    if (data.user && !data.user.is_anonymous) {
      // 既存アカウントへのログイン（user_id が変わる）では完了通知を出さない
      const upgradedSameUser = claimGuestUpgradeComplete(data.user, {
        previousUserId: previousUser?.id ?? null,
        previousWasAnonymous: Boolean(previousUser?.is_anonymous),
      });
      if (upgradedSameUser) {
        setRegistrationNotice("registered");
        trackAdFunnelEvent("registered");
      } else {
        clearAllRegistrationUpgradeState();
        setRegistrationNotice(null);
      }
      setShowAuth(false);
      setAuthFormMessage("");
      setPassword("");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setItems([]);
  };

  const typeLabel: Record<string, string> = {
    book: "本",
    manga: "漫画",
    movie: "映画",
    music: "音楽",
    game: "ゲーム",
    anime: "アニメ",
    drama: "ドラマ",
  };

  const apiSearchPlaceholder: Record<ApiSearchGenre, string> = {
    book: "タイトルまたは著者名を入力",
    manga: "漫画のタイトルを入力",
    movie: "映画のタイトルを入力",
    anime: "アニメのタイトルを入力",
    drama: "ドラマのタイトルを入力",
    music: "アルバム名・アーティスト名を入力",
    game: "ゲームのタイトルを入力",
  };

  const apiCreatorFallback: Record<ApiSearchGenre, string> = {
    book: "著者不明",
    manga: "作者不明",
    movie: "監督不明",
    anime: "制作不明",
    drama: "制作不明",
    music: "アーティスト不明",
    game: "開発元不明",
  };

  const isShelfEmpty = items.length === 0;
  /** 取得完了後の本当の空棚（読込前のフラッシュを避ける） */
  const showEmptyOnboarding = loaded && isShelfEmpty;
  const showShelfToolbar = loaded;
  /** ゲストかつ作品ありのときだけ、控えめな正式登録案内 */
  const showGuestUpgradeNudge =
    loaded && Boolean(user?.is_anonymous) && items.length >= 1;

  const openComposeForm = () => {
    resetComposeFields();
    resetApiSearch();
    setApiSearchGenre("book");
    setShowForm(true);
  };

  const closeComposeForm = () => {
    setShowForm(false);
    resetComposeFields();
    resetApiSearch();
  };

  const visibleItems = filterShelfItemsInAdditionOrder(items, {
    searchQuery,
    categoryFilter,
  });

  const showAnimeDramaOption = type === "anime" || type === "drama";
  const authModalOpen = Boolean(showAuth && user?.is_anonymous);
  const authModalIsLoginHelp =
    registrationNotice === "confirm_login" ||
    registrationNotice === "email_pending";
  const authModalTitle = authModalIsLoginHelp
    ? "メールアドレスでログイン"
    : "正式アカウントに登録";
  const authModalLead = authModalIsLoginHelp
    ? "登録したメールアドレスとパスワードでログインすると、ゲスト時代の棚を引き継げます。"
    : "今のゲストの棚と作品をそのまま引き継いで、別の端末からも使えるようになります。";

  const closeAuthModal = () => {
    setShowAuth(false);
    setAuthFormMessage("");
  };

  /**
   * ボタンクリックと同じジェスチャで portal オーバーレイが描画されると、
   * mouseup/click が背景に届いて即 close される。開くのを次タスクへ遅らせ、
   * 直後の背景クリックは短時間無視する。
   */
  const openAuthModal = () => {
    authModalIgnoreCloseUntilRef.current = Date.now() + 400;
    window.setTimeout(() => {
      setShowAuth(true);
    }, 0);
  };

  const handleAuthOverlayPointerDown = (
    event: MouseEvent<HTMLDivElement>
  ) => {
    if (event.target !== event.currentTarget) return;
    if (Date.now() < authModalIgnoreCloseUntilRef.current) return;
    closeAuthModal();
  };

  // body を position:fixed にすると、長い棚では fixed モーダルの基準が
  // ページ全体になり画面外（上部）に寄る。overflow ロックのみ使う。
  useEffect(() => {
    if (!authModalOpen) return;
    const { documentElement, body } = document;
    const prev = {
      htmlOverflow: documentElement.style.overflow,
      bodyOverflow: body.style.overflow,
    };
    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      documentElement.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
    };
  }, [authModalOpen]);

  useVisualViewportHeight(authModalOpen);

  useEffect(() => {
    if (!authModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAuthModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authModalOpen]);

  return (
    <div className="my-shelf">
      <header className="my-shelf-topbar">
        <div className="my-shelf-topbar-inner">
          <BrandLogoLink className="my-shelf-logo-link" />
          <div className="my-shelf-account">
            <Link href="/search" className="my-shelf-search-btn">
              <svg
                className="my-shelf-search-btn-icon"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="5.25" />
                <path d="m15 15 4.5 4.5" />
              </svg>
              <span>棚を探す</span>
            </Link>
            {authReady && !user && (
              <button
                type="button"
                className="my-shelf-text-btn"
                onClick={openAuthModal}
              >
                ログイン / 新規登録
              </button>
            )}
            {authReady && user?.is_anonymous && (
              <button
                type="button"
                className="my-shelf-text-btn"
                onClick={openAuthModal}
              >
                正式アカウントに登録
              </button>
            )}
            {authReady && user && !user.is_anonymous && (
              <span className="my-shelf-user">{user.email}</span>
            )}
            {authReady && user && !user.is_anonymous && (
              <button
                type="button"
                className="my-shelf-text-btn"
                onClick={handleSignOut}
              >
                ログアウト
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="my-shelf-main">
        {registrationNotice === "email_pending" && (
          <aside
            className="my-shelf-reg-notice my-shelf-reg-notice--pending"
            aria-live="polite"
          >
            <p className="my-shelf-reg-notice-title">確認メールを送信しました</p>
            <p className="my-shelf-reg-notice-body">
              メール内のリンクから確認してください。確認が終わるまでは正式登録は完了していません。
            </p>
            <p className="my-shelf-reg-notice-body">
              スマホなど別の端末で確認しても構いません。この画面を開いたままにしておくと、確認完了を検知して正式アカウントへ切り替えます。切り替わらないときは、下からログインしてください。
            </p>
            {showLoopbackConfirmHint && (
              <p className="my-shelf-reg-notice-body">
                localhost
                宛ての確認リンクはスマホでページを表示できません。認証自体は完了していることが多いので、このPCのまま待つか、下からログインしてください。
              </p>
            )}
            <button
              type="button"
              className="my-shelf-reg-notice-action"
              onClick={() => {
                const pending = getEmailConfirmPending();
                if (pending?.email) setEmail(pending.email);
                setAuthFormMessage(
                  "メール確認が完了していれば、登録したメールアドレスとパスワードでログインできます。"
                );
                openAuthModal();
              }}
            >
              ログインフォームを開く
            </button>
          </aside>
        )}

        {registrationNotice === "registered" && user && !user.is_anonymous && (
          <aside
            className="my-shelf-reg-notice my-shelf-reg-notice--done"
            aria-live="polite"
          >
            <p className="my-shelf-reg-notice-title">正式アカウントになりました</p>
            <p className="my-shelf-reg-notice-body">
              ゲスト時代の棚と作品はそのまま引き継がれています。別の端末からも、同じメールアドレスでログインできます。
            </p>
            <button
              type="button"
              className="my-shelf-reg-notice-action"
              onClick={() => setRegistrationNotice(null)}
            >
              とじる
            </button>
          </aside>
        )}

        {registrationNotice === "confirm_login" && (
          <aside
            className="my-shelf-reg-notice my-shelf-reg-notice--pending"
            aria-live="polite"
          >
            <p className="my-shelf-reg-notice-title">
              メール確認が完了しました。ログインしてください
            </p>
            <p className="my-shelf-reg-notice-body">
              この端末にはまだ正式セッションがありません。登録したメールアドレスとパスワードでログインすると、自分の棚へ入れます。
            </p>
            {!authModalOpen && (
              <button
                type="button"
                className="my-shelf-reg-notice-action"
                onClick={openAuthModal}
              >
                ログインフォームを開く
              </button>
            )}
          </aside>
        )}

        <section className="my-shelf-intro">
          <div className="my-shelf-intro-heading-row">
            <h1 className="my-shelf-heading">自分の棚</h1>
            {user && (
              <div className="my-shelf-intro-tools">
                <div className="my-shelf-intro-tools-top">
                  <ShelfDisplayNameSettings user={user} />
                </div>
                <div className="my-shelf-intro-tools-bottom">
                  <ShelfVisibilitySettings
                    user={user}
                    onRequestRegister={openAuthModal}
                  />
                  {!user.is_anonymous && <ShelfConnections user={user} />}
                  <ShelfFollowRequests user={user} />
                  {!user.is_anonymous && <ShelfShareButton user={user} />}
                </div>
              </div>
            )}
          </div>
          <p className="my-shelf-desc">
            好きな作品を、ジャンルを超えてひとつの棚に。
          </p>
          <button
            type="button"
            className={`btn-primary${showForm ? " is-close" : ""}`}
            onClick={() => {
              if (showForm) {
                closeComposeForm();
                return;
              }
              openComposeForm();
            }}
          >
            {showForm ? "閉じる" : "＋ 作品を追加"}
          </button>
          {showShelfToolbar ? (
            <hr className="my-shelf-section-rule" aria-hidden="true" />
          ) : null}
        </section>

        {showForm && (
          <ShelfModalOrInline
            asModal
            title={editingId ? "作品を編集" : "作品を追加"}
            onClose={closeComposeForm}
            className="my-shelf-compose-modal"
          >
          <section
            id="my-shelf-compose"
            className="my-shelf-compose my-shelf-compose--in-modal"
          >
            <h2 className="my-shelf-compose-heading">
              {editingId ? "作品を編集" : "作品を追加"}
            </h2>

            {!editingId && (
              <div className="shelf-form my-shelf-api-search">
                <p className="my-shelf-compose-label">作品を検索</p>
                <div
                  className={`my-shelf-api-search-controls${apiSearchGenre === "music" ? " is-music" : ""}`}
                >
                  <label className="my-shelf-api-search-genre">
                    <span className="sr-only">ジャンル</span>
                    <select
                      value={apiSearchGenre}
                      onChange={(e) =>
                        handleApiSearchGenreChange(
                          e.target.value as ApiSearchGenre
                        )
                      }
                    >
                      <option value="book">本</option>
                      <option value="manga">漫画</option>
                      <option value="movie">映画</option>
                      <option value="anime">アニメ</option>
                      <option value="drama">ドラマ</option>
                      <option value="music">音楽</option>
                      <option value="game">ゲーム</option>
                    </select>
                  </label>
                  {apiSearchGenre === "music" ? (
                    <>
                      <label className="my-shelf-api-search-genre">
                        <span className="sr-only">種類</span>
                        <select
                          value={musicKind}
                          onChange={(e) => {
                            const nextKind = e.target.value as MusicSearchKind;
                            if (nextKind === musicKind) return;
                            setMusicKind(nextKind);
                            resetMusicResultView();
                          }}
                        >
                          <option value="all">すべて</option>
                          <option value="album">アルバム</option>
                          <option value="single">シングル</option>
                          <option value="song">楽曲</option>
                        </select>
                      </label>
                      <input
                        type="text"
                        placeholder="作品名"
                        value={musicTitle}
                        onChange={(e) => {
                          setMusicTitle(e.target.value);
                          resetMusicResultView();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleApiSearch();
                          }
                        }}
                      />
                      <input
                        type="text"
                        placeholder="アーティスト名"
                        value={musicArtist}
                        onChange={(e) => {
                          setMusicArtist(e.target.value);
                          resetMusicResultView();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleApiSearch();
                          }
                        }}
                      />
                    </>
                  ) : (
                    <input
                      type="text"
                      placeholder={apiSearchPlaceholder[apiSearchGenre]}
                      value={apiSearchQuery}
                      onChange={(e) => setApiSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleApiSearch();
                        }
                      }}
                    />
                  )}
                  <div className="my-shelf-api-search-actions">
                    <button
                      type="button"
                      className="my-shelf-api-search-submit"
                      onClick={handleApiSearch}
                      disabled={apiSearchLoading || musicLoadingMore}
                    >
                      {apiSearchLoading ? "検索中..." : "検索"}
                    </button>
                    <button
                      type="button"
                      className="my-shelf-reset my-shelf-api-search-reset"
                      onClick={clearApiSearchQueryAndResults}
                      disabled={apiSearchLoading || musicLoadingMore}
                    >
                      リセット
                    </button>
                  </div>
                </div>
                {apiSearchGenre === "music" ? (
                  <p className="my-shelf-api-search-music-hint">
                    検索のヒント：曲名・作品名とアーティスト名を正確に入力すると、ジャケット画像が見つかりやすくなります。
                  </p>
                ) : null}

                {apiSearchLoading && (
                  <p className="my-shelf-api-search-status">検索中...</p>
                )}
                {!apiSearchLoading && apiSearchError && (
                  <p className="shelf-error">{apiSearchError}</p>
                )}
                {!apiSearchLoading &&
                  !apiSearchError &&
                  apiHasSearched &&
                  apiSearchResults.length === 0 && (
                    <p className="my-shelf-api-search-status">
                      {apiSearchGenre === "music"
                        ? "作品が見つかりませんでした。音楽作品は登録分類が異なる場合があります。「シングル」「楽曲」「すべて」を切り替えて検索してみてください。"
                        : apiSearchGenre === "movie" ||
                            apiSearchGenre === "drama" ||
                            apiSearchGenre === "anime"
                          ? "作品が見つかりませんでした。中黒（・）やスペースの有無、邦題・原題（英語タイトル）など、表記を変えて検索してみてください。"
                          : "作品が見つかりませんでした。タイトルの中黒（・）やスペースの有無など、表記を変えて検索してみてください。"}
                    </p>
                  )}
                {apiAddMessage && (
                  <p className="my-shelf-api-search-success" role="status">
                    {apiAddMessage}
                  </p>
                )}
                {apiAddError && <p className="shelf-error">{apiAddError}</p>}
                {!apiSearchLoading &&
                  !apiSearchError &&
                  apiSearchGenre === "book" &&
                  bookSearchAttribution &&
                  apiSearchResults.length > 0 && (
                    <p className="my-shelf-api-search-attribution">
                      {bookSearchAttribution.text}{" "}
                      <a
                        href={bookSearchAttribution.licenseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {bookSearchAttribution.license}
                      </a>
                    </p>
                  )}
                {!apiSearchLoading &&
                  !apiSearchError &&
                  (apiSearchGenre === "movie" ||
                    apiSearchGenre === "anime" ||
                    apiSearchGenre === "drama") &&
                  tmdbSearchAttribution &&
                  apiSearchResults.length > 0 && (
                    <p className="my-shelf-api-search-attribution my-shelf-tmdb-attribution">
                      <a
                        href={tmdbSearchAttribution.homeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="my-shelf-tmdb-logo-link"
                      >
                        <img
                          src={tmdbSearchAttribution.logoUrl}
                          alt="TMDB"
                          className="my-shelf-tmdb-logo"
                          width={80}
                          height={11}
                        />
                      </a>
                      <span>{tmdbSearchAttribution.text}</span>
                    </p>
                  )}
                {!apiSearchLoading &&
                  !apiSearchError &&
                  apiSearchResults.map((item, index) => {
                    const resultKey = `${item.id ?? "item"}-${index}`;
                    const isAdding = addingResultKey === resultKey;
                    const itemId = String(item.id ?? "");
                    const coverFailed =
                      (apiSearchGenre === "music" &&
                        failedMusicCoverIds.has(itemId)) ||
                      (apiSearchGenre === "book" &&
                        failedBookCoverIds.has(itemId));
                    const coverPending =
                      apiSearchGenre === "book" &&
                      pendingBookCoverIds.has(itemId);
                    const candidates = Array.isArray(item.imageCandidates)
                      ? item.imageCandidates.filter(
                          (url: unknown): url is string =>
                            typeof url === "string" && url.trim() !== ""
                        )
                      : [];
                    const coverIndex = musicCoverIndexes[itemId] ?? 0;
                    const coverSrc =
                      candidates[coverIndex] ??
                      (typeof item.imageUrl === "string" ? item.imageUrl : "");
                    const showCover = Boolean(coverSrc) && !coverFailed;
                    const subtitle =
                      typeof item.subtitle === "string"
                        ? item.subtitle.trim()
                        : "";
                    const creatorText = String(item.creator ?? "").trim();
                    const useCreatorFallback =
                      apiSearchGenre !== "movie" &&
                      apiSearchGenre !== "anime" &&
                      apiSearchGenre !== "drama";
                    const creditType =
                      apiSearchGenre === "movie" ||
                      apiSearchGenre === "anime" ||
                      apiSearchGenre === "drama"
                        ? apiSearchGenre
                        : apiSearchGenre;
                    const parsedCredit = parseStoredCreatorCredit(
                      creatorText,
                      creditType
                    );
                    const roleFromApi = String(
                      item.creatorRoleLabel ?? ""
                    ).trim();
                    const creatorLabel = creatorText
                      ? formatCreatorWithRole(
                          roleFromApi || parsedCredit?.roleLabel || "",
                          parsedCredit?.text || creatorText
                        )
                      : useCreatorFallback
                        ? apiCreatorFallback[apiSearchGenre]
                        : "";
                    const seasonPicker = needsTmdbSeasonPicker(item);
                    const pickerOpen = tmdbPickerResultKey === resultKey;

                    return (
                      <div
                        key={resultKey}
                        className="my-shelf-search-hit-block"
                      >
                        <div className="my-shelf-search-hit">
                          {showCover ? (
                            <img
                              src={coverSrc}
                              alt={item.title}
                              onLoad={(event) => {
                                const id = String(item.id ?? "");
                                const src =
                                  event.currentTarget.currentSrc ||
                                  event.currentTarget.src;
                                if (!id || !src) return;
                                if (
                                  apiSearchGenre === "music" &&
                                  musicKind === "song"
                                ) {
                                  setConfirmedMusicCoverUrls((prev) => {
                                    if (prev[id] === src) return prev;
                                    return { ...prev, [id]: src };
                                  });
                                  return;
                                }
                                if (apiSearchGenre === "book") {
                                  setConfirmedBookCoverUrls((prev) => {
                                    if (prev[id] === src) return prev;
                                    return { ...prev, [id]: src };
                                  });
                                }
                              }}
                              onError={() => {
                                const id = String(item.id ?? "");
                                if (!id) return;
                                if (apiSearchGenre === "book") {
                                  setConfirmedBookCoverUrls((prev) => {
                                    if (!(id in prev)) return prev;
                                    const next = { ...prev };
                                    delete next[id];
                                    return next;
                                  });
                                  setFailedBookCoverIds((failed) => {
                                    if (failed.has(id)) return failed;
                                    const nextFailed = new Set(failed);
                                    nextFailed.add(id);
                                    return nextFailed;
                                  });
                                  return;
                                }
                                if (apiSearchGenre !== "music") return;
                                if (musicKind === "song") {
                                  setConfirmedMusicCoverUrls((prev) => {
                                    if (!(id in prev)) return prev;
                                    const next = { ...prev };
                                    delete next[id];
                                    return next;
                                  });
                                }
                                const urls =
                                  candidates.length > 0
                                    ? candidates
                                    : coverSrc
                                      ? [coverSrc]
                                      : [];
                                setMusicCoverIndexes((prev) => {
                                  const current = prev[id] ?? 0;
                                  const next = current + 1;
                                  if (next < urls.length) {
                                    return { ...prev, [id]: next };
                                  }
                                  setFailedMusicCoverIds((failed) => {
                                    if (failed.has(id)) return failed;
                                    const nextFailed = new Set(failed);
                                    nextFailed.add(id);
                                    return nextFailed;
                                  });
                                  return prev;
                                });
                              }}
                            />
                          ) : coverPending ? (
                            <div className="my-shelf-search-hit-placeholder">
                              表紙取得中…
                            </div>
                          ) : apiSearchGenre === "book" ? (
                            <BookPaperbackCover
                              title={String(item.title ?? "")}
                              creator={String(item.creator ?? "")}
                              variant="search"
                              className="my-shelf-search-hit-paperback"
                            />
                          ) : (
                            <div className="my-shelf-search-hit-placeholder">
                              NO IMAGE
                            </div>
                          )}
                          <div>
                            <div>
                              {item.title}
                              {creatorLabel ? ` — ${creatorLabel}` : ""}
                            </div>
                            {subtitle ? (
                              <div className="my-shelf-search-hit-subtitle">
                                {subtitle}
                              </div>
                            ) : null}
                          </div>
                          {seasonPicker ? (
                            <button
                              type="button"
                              onClick={() => {
                                void openTmdbSeasonPicker(item, resultKey);
                              }}
                              disabled={
                                addingResultKey !== null ||
                                (tmdbPickerLoading && pickerOpen)
                              }
                            >
                              {tmdbPickerLoading && pickerOpen
                                ? "読み込み中..."
                                : pickerOpen
                                  ? "閉じる"
                                  : "選ぶ"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                handleAddFromSearch(item, resultKey)
                              }
                              disabled={addingResultKey !== null}
                            >
                              {isAdding ? "追加中..." : "＋ 棚に追加"}
                            </button>
                          )}
                        </div>
                        {seasonPicker && pickerOpen ? (
                          <div className="my-shelf-tmdb-season-picker">
                            {tmdbPickerLoading ? (
                              <p className="my-shelf-api-search-status">
                                シーズン情報を取得中...
                              </p>
                            ) : null}
                            {tmdbPickerError ? (
                              <p className="shelf-error">{tmdbPickerError}</p>
                            ) : null}
                            {!tmdbPickerLoading &&
                              tmdbPickerOptions.map((option, optionIndex) => {
                                const optionKey = `${option.id ?? "opt"}-${optionIndex}`;
                                const optionAdding =
                                  addingResultKey === optionKey;
                                const optionCover =
                                  typeof option.imageUrl === "string"
                                    ? option.imageUrl
                                    : "";
                                const optionSubtitle =
                                  typeof option.subtitle === "string"
                                    ? option.subtitle.trim()
                                    : "";
                                const optionCreatorRaw = String(
                                  option.creator ?? ""
                                ).trim();
                                const optionParsed = parseStoredCreatorCredit(
                                  optionCreatorRaw,
                                  apiSearchGenre === "anime" ||
                                    apiSearchGenre === "drama"
                                    ? apiSearchGenre
                                    : "drama"
                                );
                                const optionRole = String(
                                  option.creatorRoleLabel ?? ""
                                ).trim();
                                const optionCreator = optionCreatorRaw
                                  ? formatCreatorWithRole(
                                      optionRole ||
                                        optionParsed?.roleLabel ||
                                        "",
                                      optionParsed?.text || optionCreatorRaw
                                    )
                                  : "";
                                return (
                                  <div
                                    key={optionKey}
                                    className="my-shelf-tmdb-season-option"
                                  >
                                    {optionCover ? (
                                      <img
                                        src={optionCover}
                                        alt={option.title}
                                      />
                                    ) : (
                                      <div className="my-shelf-search-hit-placeholder">
                                        NO IMAGE
                                      </div>
                                    )}
                                    <div>
                                      <div>{option.title}</div>
                                      {optionCreator ? (
                                        <div className="my-shelf-search-hit-subtitle">
                                          {optionCreator}
                                        </div>
                                      ) : null}
                                      {optionSubtitle ? (
                                        <div className="my-shelf-search-hit-subtitle">
                                          {optionSubtitle}
                                        </div>
                                      ) : null}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAddFromSearch(option, optionKey)
                                      }
                                      disabled={addingResultKey !== null}
                                    >
                                      {optionAdding
                                        ? "追加中..."
                                        : "＋ 棚に追加"}
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                {(musicMoreError || gameMoreError || bookMoreError) && (
                  <p className="shelf-error">
                    {musicMoreError || gameMoreError || bookMoreError}
                  </p>
                )}
                {apiSearchGenre === "music" &&
                  !apiSearchLoading &&
                  !apiSearchError &&
                  musicNextOffset !== null && (
                    <button
                      type="button"
                      className="my-shelf-api-search-submit my-shelf-api-search-more"
                      onClick={() => {
                        void runMusicSearch({
                          title: musicTitle.trim(),
                          artist: musicArtist.trim(),
                          kind: musicKind,
                          offset: musicNextOffset,
                          append: true,
                        });
                      }}
                      disabled={musicLoadingMore || addingResultKey !== null}
                    >
                      {musicLoadingMore ? "読み込み中..." : "もっと見る"}
                    </button>
                  )}
                {apiSearchGenre === "game" &&
                  !apiSearchLoading &&
                  !apiSearchError &&
                  gameNextOffset !== null && (
                    <button
                      type="button"
                      className="my-shelf-api-search-submit my-shelf-api-search-more"
                      onClick={() => {
                        void runGameSearch({
                          query: apiSearchQuery.trim(),
                          offset: gameNextOffset,
                          append: true,
                        });
                      }}
                      disabled={gameLoadingMore || addingResultKey !== null}
                    >
                      {gameLoadingMore ? "読み込み中..." : "もっと見る"}
                    </button>
                  )}
                {apiSearchGenre === "book" &&
                  !apiSearchLoading &&
                  !apiSearchError &&
                  bookNextOffset !== null && (
                    <button
                      type="button"
                      className="my-shelf-api-search-submit my-shelf-api-search-more"
                      onClick={() => {
                        void loadMoreBookResults();
                      }}
                      disabled={bookLoadingMore || addingResultKey !== null}
                    >
                      {bookLoadingMore ? "読み込み中..." : "さらに表示"}
                    </button>
                  )}
                {!apiSearchLoading &&
                  !apiSearchError &&
                  apiSearchResults.length > 0 && (
                    <button
                      type="button"
                      className="my-shelf-api-search-submit my-shelf-api-search-close"
                      onClick={collapseApiSearchResults}
                      disabled={
                        musicLoadingMore ||
                        gameLoadingMore ||
                        bookLoadingMore ||
                        addingResultKey !== null
                      }
                    >
                      閉じる
                    </button>
                  )}
              </div>
            )}

            {!editingId && !showManualForm && (
              <button
                type="button"
                className="my-shelf-manual-toggle"
                onClick={() => {
                  setEditingId(null);
                  setError("");
                  setShowManualForm(true);
                }}
              >
                手入力で作品を追加
              </button>
            )}

            {showManualForm && (
              <div className="shelf-form">
                <div className="my-shelf-manual-form-header">
                  <h3 className="shelf-form-title">
                    {editingId ? "作品を編集" : "手入力で作品を追加"}
                  </h3>
                  <button
                    type="button"
                    className="my-shelf-auth-close my-shelf-manual-form-close"
                    onClick={closeManualForm}
                  >
                    閉じる
                  </button>
                </div>
                {error && <p className="shelf-error">{error}</p>}
                <label className="shelf-field">
                  作品名
                  <input
                    type="text"
                    placeholder="作品名を入力"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="shelf-field">
                  作者・監督・アーティスト（任意）
                  <input
                    type="text"
                    placeholder="未入力でも登録できます"
                    value={creator}
                    onChange={(e) => setCreator(e.target.value)}
                  />
                </label>
                <label className="shelf-field">
                  画像URL（任意）
                  <input
                    type="text"
                    placeholder="未入力でも登録できます"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </label>
                <label className="shelf-field">
                  自由記入欄（任意）
                  <textarea
                    rows={5}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    placeholder="未入力でも登録できます"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <span className="shelf-field-count">
                    {description.trim().length}/{DESCRIPTION_MAX_LENGTH}
                  </span>
                </label>
                <label className="shelf-field">
                  ジャンル
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as MediaType)}
                  >
                    <option value="">カテゴリーを選択</option>
                    <option value="book">本</option>
                    <option value="manga">漫画</option>
                    <option value="movie">映画</option>
                    <option value="music">音楽</option>
                    <option value="game">ゲーム</option>
                    {showAnimeDramaOption && (
                      <>
                        <option value="anime">アニメ</option>
                        <option value="drama">ドラマ</option>
                      </>
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  className="shelf-form-submit"
                  onClick={handleAdd}
                >
                  {editingId ? "変更を保存" : "追加する"}
                </button>
              </div>
            )}
          </section>
          </ShelfModalOrInline>
        )}

        {showShelfToolbar && (
          <section className="my-shelf-toolbar" aria-label="棚内の検索と絞り込み">
            <p className="my-shelf-toolbar-hint">棚の作品を探す・絞り込む</p>
            <div
              className={`my-shelf-toolbar-row${
                searchQuery.trim() !== "" || categoryFilter !== "all"
                  ? " has-reset"
                  : ""
              }`}
            >
              <input
                className="my-shelf-control my-shelf-control--search"
                type="text"
                placeholder="作品名・作者名で検索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="my-shelf-control my-shelf-control--filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">全ジャンル</option>
                <option value="book">本</option>
                <option value="manga">漫画</option>
                <option value="movie">映画</option>
                <option value="music">音楽</option>
                <option value="game">ゲーム</option>
                <option value="anime">アニメ</option>
                <option value="drama">ドラマ</option>
              </select>
              {searchQuery.trim() !== "" || categoryFilter !== "all" ? (
                <button
                  type="button"
                  className="my-shelf-reset"
                  onClick={handleResetFilters}
                >
                  リセット
                </button>
              ) : null}
            </div>
          </section>
        )}

        <section className="my-shelf-collection">
          {showEmptyOnboarding ? (
            !showForm && (
              <div className="my-shelf-empty-state">
                {/* 0件でも固定装飾付きの画像棚を表示 */}
                <ImageShelf items={[]} onOpen={setDetailItem} />
                <p className="my-shelf-empty-state-title">まだ作品がありません</p>
                <p className="my-shelf-empty-state-lead">
                  まずは好きな本・漫画・映画・音楽・ゲームを棚に並べてみましょう。
                </p>
              </div>
            )
          ) : (
            !isShelfEmpty && (
              <>
                <div className="my-shelf-count-row">
                  <p className="my-shelf-count">{visibleItems.length}件の作品</p>
                  {!selectionMode ? (
                    <button
                      type="button"
                      className="my-shelf-select-delete"
                      disabled={visibleItems.length === 0 || bulkDeleting}
                      onClick={() => {
                        setSelectedIds(new Set());
                        setSelectionMode(true);
                        setDetailItem(null);
                        setDetailEditing(false);
                      }}
                    >
                      選択して削除
                    </button>
                  ) : (
                    <div
                      className="my-shelf-bulk-delete-bar"
                      role="group"
                      aria-label="複数選択削除"
                    >
                      <span className="my-shelf-bulk-delete-count">
                        選択中：{selectedIds.size}件
                      </span>
                      <button
                        type="button"
                        className="my-shelf-bulk-delete-confirm"
                        disabled={selectedIds.size === 0 || bulkDeleting}
                        onClick={() => {
                          void handleBulkDelete();
                        }}
                      >
                        {bulkDeleting
                          ? "削除中…"
                          : `選択した${selectedIds.size}件を削除`}
                      </button>
                      <button
                        type="button"
                        className="my-shelf-bulk-delete-cancel"
                        disabled={bulkDeleting}
                        onClick={exitSelectionMode}
                      >
                        キャンセル
                      </button>
                    </div>
                  )}
                </div>

                {visibleItems.length === 0 && (
                  <p className="my-shelf-empty">該当する作品がありません。</p>
                )}

                <ImageShelf
                  items={visibleItems}
                  onOpen={setDetailItem}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                />
              </>
            )
          )}
        </section>

        {showGuestUpgradeNudge && (
          <aside
            className="my-shelf-guest-upgrade"
            aria-label="正式アカウントへの登録案内"
          >
            <p className="my-shelf-guest-upgrade-title">
              大切な棚を、これからも。
            </p>
            <p className="my-shelf-guest-upgrade-lead">
              正式アカウントに登録すると、今の棚と作品をそのまま引き継いで、別の端末からも利用できます。
            </p>
            <button
              type="button"
              className="my-shelf-guest-upgrade-link"
              onClick={openAuthModal}
            >
              無料で正式登録する →
            </button>
          </aside>
        )}
      </main>

      {authModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="my-shelf-auth-overlay"
            role="presentation"
            onMouseDown={handleAuthOverlayPointerDown}
          >
            <div
              className="my-shelf-auth-panel shelf-form"
              role="dialog"
              aria-modal="true"
              aria-labelledby="my-shelf-auth-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="my-shelf-auth-header">
                <h2 id="my-shelf-auth-title" className="shelf-form-title">
                  {authModalTitle}
                </h2>
                <button
                  type="button"
                  className="my-shelf-auth-close"
                  onClick={closeAuthModal}
                >
                  閉じる
                </button>
              </div>
              <p className="my-shelf-auth-lead">{authModalLead}</p>
              {user?.is_anonymous && (
                <div className="my-shelf-auth-switch-note">
                  <p className="my-shelf-auth-switch-note-title">
                    <svg
                      className="my-shelf-auth-switch-note-icon"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    <span>すでにアカウントをお持ちの方</span>
                  </p>
                  <p className="my-shelf-auth-switch-note-body">
                    既存のアカウントにログインしても、今のゲストの棚や作品は引き継がれません。引き継ぎたい場合は、新しく正式登録してください。
                  </p>
                </div>
              )}
              {authFormMessage && (
                <p className="my-shelf-auth-message" role="alert">
                  {authFormMessage}
                </p>
              )}
              <label className="shelf-field">
                メールアドレス
                <input
                  type="email"
                  placeholder="メールアドレス"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="shelf-field">
                パスワード
                <input
                  type="password"
                  placeholder="パスワード"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    authModalIsLoginHelp ? "current-password" : "new-password"
                  }
                />
              </label>
              <div className="my-shelf-auth-actions">
                {authModalIsLoginHelp ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSignIn}
                  >
                    既存アカウントでログイン
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSignUp}
                    >
                      正式登録する
                    </button>
                    <button
                      type="button"
                      className="btn-primary is-close"
                      onClick={handleSignIn}
                    >
                      既存アカウントでログイン
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      {detailItem && (
        <ShelfItemDetail
          item={items.find((item) => item.id === detailItem.id) ?? detailItem}
          genreLabel={typeLabel[detailItem.type] ?? detailItem.type}
          onClose={closeDetailModal}
          onEdit={handleEdit}
          onDelete={handleDelete}
          edit={
            detailEditing
              ? {
                  title,
                  creator,
                  imageUrl,
                  description,
                  type,
                  error,
                  showAnimeDramaOption:
                    type === "anime" ||
                    type === "drama" ||
                    detailItem.type === "anime" ||
                    detailItem.type === "drama",
                  saving: detailSaving,
                  onTitleChange: setTitle,
                  onCreatorChange: setCreator,
                  onImageUrlChange: setImageUrl,
                  onDescriptionChange: setDescription,
                  onTypeChange: setType,
                  onSave: () => {
                    void handleAdd();
                  },
                  onCancel: cancelDetailEdit,
                }
              : null
          }
        />
      )}
    </div>
  );
}
