"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { User } from "@supabase/supabase-js";
import { mediaItems } from "../data/media";
import type { MediaItem, MediaType } from "../types/media";
import { createClient } from "../utils/supabase/client";
import { formatAuthErrorMessage } from "../utils/supabase/authMessages";
import {
  buildEmailConfirmRedirectTo,
  claimGuestUpgradeComplete,
  clearAllRegistrationUpgradeState,
  clearEmailConfirmPending,
  consumeEmailConfirmReturn,
  getEmailConfirmPending,
  getPendingForUser,
  setEmailConfirmPending,
  type RegistrationNoticeKind,
} from "../utils/supabase/registrationNotice";
import ShelfConnections from "./ShelfConnections";
import ShelfDisplayNameSettings from "./ShelfDisplayNameSettings";
import ShelfFollowRequests from "./ShelfFollowRequests";
import ShelfVisibilitySettings from "./ShelfVisibilitySettings";
import {
  DESCRIPTION_MAX_LENGTH,
  normalizeDescriptionInput,
  readDescription,
  resolvePublicDisplayName,
} from "../utils/shelfDisplay";
import ShelfItemDetail from "./ShelfItemDetail";
import ShelfSpineShelf from "./ShelfSpineShelf";
import ShelfViewModeToggle, { useShelfViewMode } from "./ShelfViewModeToggle";

type ApiSearchGenre = "book" | "manga" | "movie" | "music" | "game";

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
  const [showForm, setShowForm] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<MediaType | "">("");
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
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
  const apiSearchRequestIdRef = useRef(0);

  // undefined = プロフィール未取得（「名前未設定」を出さない）
  const [myDisplayName, setMyDisplayName] = useState<
    string | null | undefined
  >(undefined);

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
  const [viewMode, setViewMode] = useShelfViewMode();

  const resetApiSearch = () => {
    apiSearchRequestIdRef.current += 1;
    setApiSearchQuery("");
    setApiSearchResults([]);
    setApiSearchLoading(false);
    setApiSearchError("");
    setApiHasSearched(false);
    setAddingResultKey(null);
    setApiAddMessage("");
    setApiAddError("");
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

  const insertItem = async (payload: {
    title: string;
    creator: string | null;
    type: MediaType;
    imageUrl: string;
    description?: string | null;
  }): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!user) {
      return { ok: false, error: "ログインしてください" };
    }

    const trimmedTitle = payload.title.trim();
    if (trimmedTitle === "") {
      return { ok: false, error: "作品名を入力してください" };
    }

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

    setItems((prev) => [
      ...prev,
      {
        ...data,
        type: data.category,
        imageUrl: data.image_url,
        description: readDescription(data.description),
        createdAt: data.created_at,
      },
    ]);

    return { ok: true };
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
    const result = await insertItem({
      title: trimmedTitle,
      creator: creatorRaw === "" ? null : creatorRaw,
      type: apiSearchGenre,
      imageUrl: (item.imageUrl ?? "").trim(),
    });

    if (!result.ok) {
      setAddingResultKey(null);
      setApiAddError(result.error);
      return;
    }

    setShowForm(false);
    resetComposeFields();
    resetApiSearch();
  };

  const handleApiSearch = async () => {
    if (!apiSearchQuery.trim()) return;

    const requestId = ++apiSearchRequestIdRef.current;
    const endpoint =
      apiSearchGenre === "book"
        ? "/api/books"
        : apiSearchGenre === "manga"
          ? "/api/manga"
          : apiSearchGenre === "movie"
            ? "/api/movies"
            : apiSearchGenre === "game"
              ? "/api/games"
              : "/api/music";

    setApiSearchLoading(true);
    setApiSearchResults([]);
    setApiSearchError("");
    setApiHasSearched(false);
    setAddingResultKey(null);
    setApiAddMessage("");
    setApiAddError("");

    try {
      const response = await fetch(
        `${endpoint}?q=${encodeURIComponent(apiSearchQuery)}`
      );

      const data = await response.json().catch(() => ({}));

      if (requestId !== apiSearchRequestIdRef.current) return;

      if (!response.ok) {
        throw new Error("検索に失敗しました");
      }

      setApiSearchResults(data.results ?? []);
      setApiHasSearched(true);
      console.log(`${apiSearchGenre}の検索結果:`, data.results);
    } catch (searchError) {
      if (requestId !== apiSearchRequestIdRef.current) return;
      console.error(`${apiSearchGenre}の検索エラー:`, searchError);
      setApiSearchResults([]);
      setApiSearchError("検索に失敗しました");
      setApiHasSearched(true);
    } finally {
      if (requestId === apiSearchRequestIdRef.current) {
        setApiSearchLoading(false);
      }
    }
  };

  const handleApiSearchGenreChange = (genre: ApiSearchGenre) => {
    apiSearchRequestIdRef.current += 1;
    setApiSearchGenre(genre);
    setApiSearchResults([]);
    setApiSearchLoading(false);
    setApiSearchError("");
    setApiHasSearched(false);
    setAddingResultKey(null);
    setApiAddMessage("");
    setApiAddError("");
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
        "メール確認のあと、まだゲスト表示のままのようです。登録したメールアドレスとパスワードでログインしてください。同じ棚の作品を引き継いで正式アカウントになります。"
      );
      setShowAuth(true);
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
        const previousUser = previousAuthUserRef.current;
        if (
          claimGuestUpgradeComplete(current, {
            previousUserId: previousUser?.id ?? null,
            previousWasAnonymous: Boolean(previousUser?.is_anonymous),
          })
        ) {
          setRegistrationNotice("registered");
          setShowAuth(false);
          setAuthFormMessage("");
        } else {
          setRegistrationNotice((prev) =>
            prev === "registered" ? null : prev
          );
        }
        return;
      }

      // まだゲスト: 戻り直後はセッション更新を一度試し、だめなら再ログイン案内
      if (fromReturn) {
        const pendingBefore = getPendingForUser(current.id);
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (cancelled) return;
        const refreshedUser = refreshed.user ?? refreshed.session?.user ?? null;
        if (
          refreshedUser &&
          !refreshedUser.is_anonymous &&
          pendingBefore &&
          refreshedUser.id === pendingBefore.userId
        ) {
          clearEmailConfirmPending();
          setUser(refreshedUser);
          setRegistrationNotice("registered");
          setShowAuth(false);
          setAuthFormMessage("");
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

  // 確認メール待ちの間、タブに戻ったときに正式化済みか再確認する（signOut はしない）
  useEffect(() => {
    if (registrationNotice !== "email_pending") return;

    let cancelled = false;

    const recheck = async () => {
      if (document.visibilityState === "hidden") return;
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const previousUser = previousAuthUserRef.current;
      if (
        data.user &&
        claimGuestUpgradeComplete(data.user, {
          previousUserId: previousUser?.id ?? null,
          previousWasAnonymous: Boolean(previousUser?.is_anonymous),
        })
      ) {
        previousAuthUserRef.current = data.user;
        setUser(data.user);
        setRegistrationNotice("registered");
        setShowAuth(false);
        setAuthFormMessage("");
      }
    };

    const onVisible = () => {
      void recheck();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [registrationNotice, supabase]);

  // ユーザー切替・再ログイン時は取得完了まで「名前未設定」を出さない
  useEffect(() => {
    setMyDisplayName(undefined);
  }, [user?.id]);

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

    if (editingId) {
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
        return;
      }
      setItems(
        items.map((item) =>
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
        )
      );
      setTitle("");
      setCreator("");
      setDescription("");
      setType("");
      setImageUrl("");
      setEditingId(null);
      setShowManualForm(false);
      setShowForm(false);
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

    setTitle("");
    setCreator("");
    setDescription("");
    setType("");
    setImageUrl("");
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
    setItems(items.filter((item) => item.id !== id));
    setDetailItem((current) => (current?.id === id ? null : current));
  };

  const handleEdit = (id: string) => {
    setDetailItem(null);
    setEditingId(id);
    const item = items.find((item) => item.id === id);
    if (!item) return;

    setTitle(item.title);
    setCreator(item.creator ?? "");
    setDescription(item.description ?? "");
    setType(item.type);
    setImageUrl(item.imageUrl ?? "");
    setShowForm(true);
    setShowManualForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setError("");
  };

  const handleSignUp = async () => {
    setAuthFormMessage("");
    const { data: userData } = await supabase.auth.getUser();

    if (userData.user?.is_anonymous) {
      const { error } = await supabase.auth.updateUser(
        {
          email,
          password,
        },
        {
          emailRedirectTo: buildEmailConfirmRedirectTo(window.location.origin),
        }
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
      options: {
        emailRedirectTo: buildEmailConfirmRedirectTo(window.location.origin),
      },
    });

    if (error) {
      setAuthFormMessage(formatAuthErrorMessage(error, "sign_up"));
      setShowAuth(true);
      return;
    }

    setAuthFormMessage(
      "登録手続きを開始しました。メール内のリンクから確認してください。確認が終わるまでは登録は完了していません。"
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
    book: "本のタイトルを入力",
    manga: "漫画のタイトルを入力",
    movie: "映画のタイトルを入力",
    music: "アルバム名・アーティスト名を入力",
    game: "ゲームのタイトルを入力",
  };

  const apiCreatorFallback: Record<ApiSearchGenre, string> = {
    book: "著者不明",
    manga: "作者不明",
    movie: "監督不明",
    music: "アーティスト不明",
    game: "開発元不明",
  };

  const isShelfEmpty = items.length === 0;
  /** 取得完了後の本当の空棚（読込前のフラッシュを避ける） */
  const showEmptyOnboarding = loaded && isShelfEmpty;
  const showShelfToolbar = loaded && !isShelfEmpty;
  /** ゲストかつ作品ありのときだけ、控えめな正式登録案内 */
  const showGuestUpgradeNudge =
    loaded && Boolean(user?.is_anonymous) && items.length >= 1;

  const openComposeForm = () => {
    resetComposeFields();
    resetApiSearch();
    setApiSearchGenre("book");
    setShowForm(true);
  };

  const visibleItems = [...items]
    .sort((a, b) => {
      if (sortOrder === "title") {
        return a.title.localeCompare(b.title, "ja");
      }

      const dateA = new Date(a.createdAt ?? 0).getTime();
      const dateB = new Date(b.createdAt ?? 0).getTime();

      if (sortOrder === "newest") {
        return dateB - dateA;
      }

      if (sortOrder === "oldest") {
        return dateA - dateB;
      }

      return 0;
    })
    .filter((item) => categoryFilter === "all" || item.type === categoryFilter)
    .filter(
      (item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.creator ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    );

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
    : "今の棚と作品をそのまま引き継いで、別の端末からも使えるようになります。";

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
          <p className="my-shelf-logo">myshelf</p>
          <div className="my-shelf-account">
            <Link href="/search" className="my-shelf-text-btn">
              棚を探す
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
              確認後もこの画面がゲストのままのときは、登録したメールアドレスとパスワードでログインしてください。
            </p>
            <button
              type="button"
              className="my-shelf-reg-notice-action"
              onClick={() => {
                const pending = getEmailConfirmPending();
                if (pending?.email) setEmail(pending.email);
                setAuthFormMessage(
                  "登録したメールアドレスとパスワードでログインしてください。"
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
            <p className="my-shelf-reg-notice-title">メール確認後のログイン</p>
            <p className="my-shelf-reg-notice-body">
              まだゲスト表示のままです。登録完了とは限りません。ログインフォームから、登録したメールアドレスとパスワードでログインしてください。
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
              <ShelfDisplayNameSettings
                user={user}
                onDisplayNameChanged={setMyDisplayName}
              />
            )}
            {user && (
              <ShelfVisibilitySettings
                user={user}
                onRequestRegister={openAuthModal}
              />
            )}
            {user && !user.is_anonymous && (
              <ShelfConnections user={user} />
            )}
            {user && <ShelfFollowRequests user={user} />}
          </div>
          {user && (
            <p className="my-shelf-display-name-line" aria-live="polite">
              表示名:{" "}
              {myDisplayName === undefined ? (
                <span
                  className="my-shelf-display-name-placeholder"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <span className="my-shelf-display-name-value">
                  {resolvePublicDisplayName({ displayName: myDisplayName })}
                </span>
              )}
            </p>
          )}
          <p className="my-shelf-desc">
            好きな作品を、ジャンルを超えてひとつの棚に。
          </p>
          {(!showEmptyOnboarding || showForm) && (
            <button
              type="button"
              className={`btn-primary${showForm ? " is-close" : ""}`}
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  resetComposeFields();
                  resetApiSearch();
                  return;
                }
                openComposeForm();
              }}
            >
              {showForm ? "閉じる" : "＋ 作品を追加"}
            </button>
          )}
        </section>

        {showForm && (
          <section className="my-shelf-compose">
            <h2 className="my-shelf-compose-heading">
              {editingId ? "作品を編集" : "作品を追加"}
            </h2>

            {!editingId && (
              <div className="shelf-form my-shelf-api-search">
                <p className="my-shelf-compose-label">作品を検索</p>
                <div className="my-shelf-api-search-controls">
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
                      <option value="music">音楽</option>
                      <option value="game">ゲーム</option>
                    </select>
                  </label>
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
                  <button
                    type="button"
                    className="my-shelf-api-search-submit"
                    onClick={handleApiSearch}
                    disabled={apiSearchLoading}
                  >
                    {apiSearchLoading ? "検索中..." : "検索"}
                  </button>
                </div>

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
                      該当する作品が見つかりませんでした
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
                  apiSearchResults.map((item, index) => {
                    const resultKey = `${item.id ?? "item"}-${index}`;
                    const isAdding = addingResultKey === resultKey;

                    return (
                      <div key={resultKey} className="my-shelf-search-hit">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.title} />
                        ) : (
                          <div className="my-shelf-search-hit-placeholder">
                            NO IMAGE
                          </div>
                        )}
                        <div>
                          {item.title} —{" "}
                          {item.creator || apiCreatorFallback[apiSearchGenre]}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddFromSearch(item, resultKey)}
                          disabled={addingResultKey !== null}
                        >
                          {isAdding ? "追加中..." : "＋ 棚に追加"}
                        </button>
                      </div>
                    );
                  })}
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
                <h3 className="shelf-form-title">
                  {editingId ? "作品を編集" : "手入力で作品を追加"}
                </h3>
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
                  紹介文（任意）
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
        )}

        {showShelfToolbar && (
          <section className="my-shelf-toolbar" aria-label="棚内の検索と絞り込み">
            <p className="my-shelf-toolbar-hint">棚に登録した作品を探す</p>
            <div className="my-shelf-toolbar-row">
              <input
                className="my-shelf-control my-shelf-control--search"
                type="text"
                placeholder="棚の中を作品名・作者名で検索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="my-shelf-control my-shelf-control--filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">すべてのカテゴリ</option>
                <option value="book">本</option>
                <option value="manga">漫画</option>
                <option value="movie">映画</option>
                <option value="music">音楽</option>
                <option value="game">ゲーム</option>
                <option value="anime">アニメ</option>
                <option value="drama">ドラマ</option>
              </select>
              <select
                className="my-shelf-control my-shelf-control--filter"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <option value="newest">新しい順</option>
                <option value="oldest">古い順</option>
                <option value="title">作品名順</option>
              </select>
              <button
                type="button"
                className="my-shelf-reset"
                onClick={handleResetFilters}
              >
                リセット
              </button>
            </div>
            <div className="my-shelf-toolbar-foot">
              <p className="my-shelf-detail-hint">
                {viewMode === "spine"
                  ? "背表紙を押すと作品詳細"
                  : "表紙を押すと作品詳細"}
              </p>
              <ShelfViewModeToggle mode={viewMode} onChange={setViewMode} />
            </div>
          </section>
        )}

        <section className="my-shelf-collection">
          {showEmptyOnboarding ? (
            !showForm && (
              <div className="my-shelf-empty-state">
                <p className="my-shelf-empty-state-title">まだ作品がありません</p>
                <p className="my-shelf-empty-state-lead">
                  まずは好きな本・漫画・映画・音楽・ゲームを棚に並べてみましょう。
                </p>
                <button
                  type="button"
                  className="btn-primary my-shelf-empty-state-cta"
                  onClick={openComposeForm}
                >
                  ＋ 最初の作品を追加
                </button>
              </div>
            )
          ) : (
            !isShelfEmpty && (
              <>
                <p className="my-shelf-count">{visibleItems.length}件の作品</p>

                {visibleItems.length === 0 && (
                  <p className="my-shelf-empty">該当する作品がありません。</p>
                )}

                {viewMode === "spine" ? (
                  <ShelfSpineShelf
                    items={visibleItems}
                    onOpen={setDetailItem}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ) : (
                <div className="my-shelf-grid">
                  {visibleItems.map((item) => (
                    <article
                      key={item.id}
                      className={`my-shelf-item my-shelf-item--${item.type}`}
                    >
                      <button
                        type="button"
                        className="my-shelf-item-open"
                        onClick={() => setDetailItem(item)}
                      >
                        <div className="my-shelf-cover">
                          <div
                            className="my-shelf-cover-fallback"
                            aria-hidden="true"
                          >
                            <span>{typeLabel[item.type] ?? "作品"}</span>
                          </div>
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt=""
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                        </div>
                        <div className="my-shelf-meta">
                          <h2 className="my-shelf-item-title">{item.title}</h2>
                          <p className="my-shelf-item-creator">
                            {item.creator || "作者不明"}
                          </p>
                          <p className="my-shelf-item-type">
                            {typeLabel[item.type] ?? item.type}
                          </p>
                        </div>
                      </button>
                      <div className="my-shelf-item-actions">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(item.id);
                          }}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(item.id);
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                )}
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
                <p className="my-shelf-auth-switch-note">
                  ※既存アカウントにログインすると、そのアカウントの棚に切り替わります。現在のゲストの作品は自動では追加されません。
                </p>
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
                    ログイン
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
                      ログイン
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
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  );
}
