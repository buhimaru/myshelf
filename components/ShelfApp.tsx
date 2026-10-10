"use client";

import { useEffect, useRef, useState } from "react";
import { mediaItems } from "../data/media";
import type { MediaType } from "../types/media";
import { createClient } from "../utils/supabase/client";

type ApiSearchGenre = "book" | "movie" | "music";

export default function ShelfApp() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  console.log("current user:", user);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [type, setType] = useState<MediaType | "">("");
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
        : apiSearchGenre === "movie"
          ? "/api/movies"
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
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
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

    if (editingId) {
      const { error: updateError } = await supabase
        .from("items")
        .update({
          title: trimmedTitle,
          creator: creatorValue,
          category: type,
          image_url: imageUrlValue,
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
              }
            : item
        )
      );
      setTitle("");
      setCreator("");
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
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setTitle("");
    setCreator("");
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
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    const item = items.find((item) => item.id === id);
    if (!item) return;

    setTitle(item.title);
    setCreator(item.creator ?? "");
    setType(item.type);
    setImageUrl(item.imageUrl ?? "");
    setShowForm(true);
    setShowManualForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setError("");
  };

  const handleSignUp = async () => {
    const { data: userData } = await supabase.auth.getUser();

    if (userData.user?.is_anonymous) {
      const { error } = await supabase.auth.updateUser({
        email,
        password,
      });

      if (error) {
        alert("アカウント登録に失敗しました: " + error.message);
        return;
      }

      alert("確認メールを送信しました。メールを確認してな！");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      alert("新規登録に失敗しました: " + error.message);
      return;
    }

    alert("登録手続きを開始しました。メールを確認してな！");
  };

  const handleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setUser(data.user);
    console.log("signin:", data, error);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setItems([]);
  };

  const handleGuestSignIn = async () => {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      alert("ゲストログインに失敗しました: " + error.message);
      return;
    }

    setUser(data.user);
    setShowAuth(false);
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
    movie: "映画のタイトルを入力",
    music: "アルバム名・アーティスト名を入力",
  };

  const apiCreatorFallback: Record<ApiSearchGenre, string> = {
    book: "著者不明",
    movie: "監督不明",
    music: "アーティスト不明",
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

  return (
    <div className="my-shelf">
      <header className="my-shelf-topbar">
        <div className="my-shelf-topbar-inner">
          <p className="my-shelf-logo">myshelf</p>
          <div className="my-shelf-account">
            {!user && (
              <button
                type="button"
                className="my-shelf-text-btn"
                onClick={() => setShowAuth(true)}
              >
                ログイン / 新規登録
              </button>
            )}
            {user?.is_anonymous && (
              <button
                type="button"
                className="my-shelf-text-btn"
                onClick={() => setShowAuth(true)}
              >
                正式アカウントに登録
              </button>
            )}
            {user && !user.is_anonymous && (
              <span className="my-shelf-user">{user.email}</span>
            )}
            {user && (
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

      {showAuth && (!user || user.is_anonymous) && (
        <div className="my-shelf-auth shelf-form">
          <h2 className="shelf-form-title">ログイン / 新規登録</h2>
          <label className="shelf-field">
            メールアドレス
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="shelf-field">
            パスワード
            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="my-shelf-auth-actions">
            <button type="button" className="btn-primary" onClick={handleSignUp}>
              新規登録
            </button>
            <button
              type="button"
              className="btn-primary is-close"
              onClick={handleSignIn}
            >
              ログイン
            </button>
            <button
              type="button"
              className="my-shelf-text-btn"
              onClick={handleGuestSignIn}
            >
              ゲストとして始める
            </button>
          </div>
        </div>
      )}

      <main className="my-shelf-main">
        <section className="my-shelf-intro">
          <h1 className="my-shelf-heading">自分の棚</h1>
          <p className="my-shelf-desc">
            好きな作品を、ジャンルを超えてひとつの棚に。
          </p>
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
              resetComposeFields();
              resetApiSearch();
              setApiSearchGenre("book");
              setShowForm(true);
            }}
          >
            {showForm ? "閉じる" : "＋ 作品を追加"}
          </button>
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
                      <option value="movie">映画</option>
                      <option value="music">音楽</option>
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

        <section className="my-shelf-toolbar">
          <input
            className="my-shelf-control"
            type="text"
            placeholder="作品名・作者名で検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="my-shelf-control"
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
            className="my-shelf-control"
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
        </section>

        <section className="my-shelf-collection">
          <p className="my-shelf-count">{visibleItems.length}件の作品</p>

          {visibleItems.length === 0 && (
            <p className="my-shelf-empty">該当する作品がありません。</p>
          )}

          <div className="my-shelf-grid">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className={`my-shelf-item my-shelf-item--${item.type}`}
              >
                <div className="my-shelf-cover">
                  <div className="my-shelf-cover-fallback" aria-hidden="true">
                    <span>{typeLabel[item.type] ?? "作品"}</span>
                  </div>
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
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
                  <div className="my-shelf-item-actions">
                    <button type="button" onClick={() => handleEdit(item.id)}>
                      編集
                    </button>
                    <button type="button" onClick={() => handleDelete(item.id)}>
                      削除
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
