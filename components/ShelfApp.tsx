"use client";

import { useEffect, useRef, useState } from "react";
import { mediaItems } from "../data/media";
import type { MediaType } from "../types/media";
import { createClient } from "../utils/supabase/client";

export default function ShelfApp() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  console.log("current user:", user);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [bookSearchResults, setBookSearchResults] = useState<any[]>([]);
  const [bookSearchLoading, setBookSearchLoading] = useState(false);
  const [bookSearchError, setBookSearchError] = useState("");
  const [bookHasSearched, setBookHasSearched] = useState(false);
  const bookSearchRequestIdRef = useRef(0);
  const [movieSearchQuery, setMovieSearchQuery] = useState("");
  const [movieSearchResults, setMovieSearchResults] = useState<any[]>([]);
  const [movieSearchLoading, setMovieSearchLoading] = useState(false);
  const [movieSearchError, setMovieSearchError] = useState("");
  const [movieHasSearched, setMovieHasSearched] = useState(false);
  const movieSearchRequestIdRef = useRef(0);
  const [musicSearchQuery, setMusicSearchQuery] = useState("");
  const [musicSearchResults, setMusicSearchResults] = useState<any[]>([]);
  const [musicSearchLoading, setMusicSearchLoading] = useState(false);
  const [musicSearchError, setMusicSearchError] = useState("");
  const [musicHasSearched, setMusicHasSearched] = useState(false);
  const musicSearchRequestIdRef = useRef(0);

const handleSelectBook = (book: any) => {
  setTitle(book.title ?? "");
  setCreator(book.creator ?? "");
  setType("book");

  setImageUrl(book.imageUrl ?? "");

  setEditingId(null);
  setError("");
  setShowForm(true);
  setBookSearchResults([]);
  setBookSearchError("");
  setBookHasSearched(false);
};

const handleBookSearch = async () => {
  if (!bookSearchQuery.trim()) return;

  const requestId = ++bookSearchRequestIdRef.current;
  setBookSearchLoading(true);
  setBookSearchResults([]);
  setBookSearchError("");
  setBookHasSearched(false);

  try {
    const response = await fetch(
      `/api/books?q=${encodeURIComponent(bookSearchQuery)}`
    );

    const data = await response.json().catch(() => ({}));

    if (requestId !== bookSearchRequestIdRef.current) return;

    if (!response.ok) {
      throw new Error("検索に失敗しました");
    }

    setBookSearchResults(data.results ?? []);
    setBookHasSearched(true);
    console.log("本の検索結果:", data.results);
  } catch (error) {
    if (requestId !== bookSearchRequestIdRef.current) return;
    console.error("本の検索エラー:", error);
    setBookSearchResults([]);
    setBookSearchError("検索に失敗しました");
    setBookHasSearched(true);
  } finally {
    if (requestId === bookSearchRequestIdRef.current) {
      setBookSearchLoading(false);
    }
  }
};

const handleSelectMovie = (movie: any) => {
  setTitle(movie.title ?? "");
  setCreator(movie.creator ?? "");
  setType("movie");
  setImageUrl(movie.imageUrl ?? "");

  setEditingId(null);
  setError("");
  setShowForm(true);
  setMovieSearchResults([]);
  setMovieSearchError("");
  setMovieHasSearched(false);
};

const handleMovieSearch = async () => {
  if (!movieSearchQuery.trim()) return;

  const requestId = ++movieSearchRequestIdRef.current;
  setMovieSearchLoading(true);
  setMovieSearchResults([]);
  setMovieSearchError("");
  setMovieHasSearched(false);

  try {
    const response = await fetch(
      `/api/movies?q=${encodeURIComponent(movieSearchQuery)}`
    );

    const data = await response.json().catch(() => ({}));

    if (requestId !== movieSearchRequestIdRef.current) return;

    if (!response.ok) {
      throw new Error("検索に失敗しました");
    }

    setMovieSearchResults(data.results ?? []);
    setMovieHasSearched(true);
    console.log("映画の検索結果:", data.results);
  } catch (error) {
    if (requestId !== movieSearchRequestIdRef.current) return;
    console.error("映画の検索エラー:", error);
    setMovieSearchResults([]);
    setMovieSearchError("検索に失敗しました");
    setMovieHasSearched(true);
  } finally {
    if (requestId === movieSearchRequestIdRef.current) {
      setMovieSearchLoading(false);
    }
  }
};

const handleSelectMusic = (music: any) => {
  setTitle(music.title ?? "");
  setCreator(music.creator ?? "");
  setType("music");
  setImageUrl(music.imageUrl ?? "");

  setEditingId(null);
  setError("");
  setShowForm(true);
  setMusicSearchResults([]);
  setMusicSearchError("");
  setMusicHasSearched(false);
};

const handleMusicSearch = async () => {
  if (!musicSearchQuery.trim()) return;

  const requestId = ++musicSearchRequestIdRef.current;
  setMusicSearchLoading(true);
  setMusicSearchResults([]);
  setMusicSearchError("");
  setMusicHasSearched(false);

  try {
    const response = await fetch(
      `/api/music?q=${encodeURIComponent(musicSearchQuery)}`
    );

    const data = await response.json().catch(() => ({}));

    if (requestId !== musicSearchRequestIdRef.current) return;

    if (!response.ok) {
      throw new Error("検索に失敗しました");
    }

    setMusicSearchResults(data.results ?? []);
    setMusicHasSearched(true);
    console.log("音楽の検索結果:", data.results);
  } catch (error) {
    if (requestId !== musicSearchRequestIdRef.current) return;
    console.error("音楽の検索エラー:", error);
    setMusicSearchResults([]);
    setMusicSearchError("検索に失敗しました");
    setMusicHasSearched(true);
  } finally {
    if (requestId === musicSearchRequestIdRef.current) {
      setMusicSearchLoading(false);
    }
  }
};
  const [creator, setCreator] = useState("");
  const [type, setType] = useState<MediaType | "">("");
  const [items, setItems] = useState<typeof mediaItems>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      const { data, error } = await supabase.from("items").select("*").eq("user_id", user.id);
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
     
    }
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
      setShowForm(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("items")
      .insert({
        title: trimmedTitle,
        category: type,
        creator: creatorValue,
        image_url: imageUrlValue,
        user_id: user.id,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setItems([
      ...items,
      {
        ...data,
        type: data.category,
        imageUrl: data.image_url,
        createdAt: data.created_at,
      },
    ]);
    setTitle("");
    setCreator("");
    setType("");
    setImageUrl("");
    setShowForm(false);
    setError("");
  };
  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("本当にこの作品を削除しますか？");

if (!confirmed) return;
    const { error } = await supabase
  .from("items")
  .delete()
  .eq("id", id);
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
            <button type="button" className="btn-primary is-close" onClick={handleSignIn}>
              ログイン
            </button>
            <button type="button" className="my-shelf-text-btn" onClick={handleGuestSignIn}>
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
              setShowForm(!showForm);
              setEditingId(null);
              setTitle("");
              setCreator("");
              setType("");
              setImageUrl("");
              setError("");
            }}
          >
            {showForm ? "閉じる" : "＋ 作品を追加"}
          </button>
        </section>

        {showForm && (
          <section className="my-shelf-compose">
            <div className="shelf-form">
              <h2 className="shelf-form-title">本を検索</h2>
              <input
                type="text"
                placeholder="本のタイトルを入力"
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleBookSearch();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleBookSearch}
                disabled={bookSearchLoading}
              >
                {bookSearchLoading ? "検索中..." : "本を検索"}
              </button>
              {bookSearchLoading && <p>検索中...</p>}
              {!bookSearchLoading && bookSearchError && (
                <p className="shelf-error">{bookSearchError}</p>
              )}
              {!bookSearchLoading &&
                !bookSearchError &&
                bookHasSearched &&
                bookSearchResults.length === 0 && (
                  <p>該当する作品が見つかりませんでした</p>
                )}
              {!bookSearchLoading &&
                !bookSearchError &&
                bookSearchResults.map((book, index) => (
                  <div key={`${book.id}-${index}`} className="my-shelf-search-hit">
                    {book.imageUrl && (
                      <img src={book.imageUrl} alt={book.title} />
                    )}
                    <div>
                      {book.title} — {book.creator || "著者不明"}
                    </div>
                    <button type="button" onClick={() => handleSelectBook(book)}>
                      この本を選ぶ
                    </button>
                  </div>
                ))}
            </div>

            <div className="shelf-form">
              <h2 className="shelf-form-title">映画を検索</h2>
              <input
                type="text"
                placeholder="映画のタイトルを入力"
                value={movieSearchQuery}
                onChange={(e) => setMovieSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleMovieSearch();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleMovieSearch}
                disabled={movieSearchLoading}
              >
                {movieSearchLoading ? "検索中..." : "映画を検索"}
              </button>
              {movieSearchLoading && <p>検索中...</p>}
              {!movieSearchLoading && movieSearchError && (
                <p className="shelf-error">{movieSearchError}</p>
              )}
              {!movieSearchLoading &&
                !movieSearchError &&
                movieHasSearched &&
                movieSearchResults.length === 0 && (
                  <p>該当する作品が見つかりませんでした</p>
                )}
              {!movieSearchLoading &&
                !movieSearchError &&
                movieSearchResults.map((movie, index) => (
                  <div key={`${movie.id}-${index}`} className="my-shelf-search-hit">
                    {movie.imageUrl && (
                      <img src={movie.imageUrl} alt={movie.title} />
                    )}
                    <div>
                      {movie.title} — {movie.creator || "監督不明"}
                    </div>
                    <button type="button" onClick={() => handleSelectMovie(movie)}>
                      この映画を選ぶ
                    </button>
                  </div>
                ))}
            </div>

            <div className="shelf-form">
              <h2 className="shelf-form-title">音楽を検索</h2>
              <input
                type="text"
                placeholder="アルバム名・アーティスト名を入力"
                value={musicSearchQuery}
                onChange={(e) => setMusicSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleMusicSearch();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleMusicSearch}
                disabled={musicSearchLoading}
              >
                {musicSearchLoading ? "検索中..." : "音楽を検索"}
              </button>
              {musicSearchLoading && <p>検索中...</p>}
              {!musicSearchLoading && musicSearchError && (
                <p className="shelf-error">{musicSearchError}</p>
              )}
              {!musicSearchLoading &&
                !musicSearchError &&
                musicHasSearched &&
                musicSearchResults.length === 0 && (
                  <p>該当する作品が見つかりませんでした</p>
                )}
              {!musicSearchLoading &&
                !musicSearchError &&
                musicSearchResults.map((music, index) => (
                  <div key={`${music.id}-${index}`} className="my-shelf-search-hit">
                    {music.imageUrl ? (
                      <img src={music.imageUrl} alt={music.title} />
                    ) : (
                      <div className="my-shelf-search-hit-placeholder">NO IMAGE</div>
                    )}
                    <div>
                      {music.title} — {music.creator || "アーティスト不明"}
                    </div>
                    <button type="button" onClick={() => handleSelectMusic(music)}>
                      この音楽を選ぶ
                    </button>
                  </div>
                ))}
            </div>

            <div className="shelf-form">
              <h2 className="shelf-form-title">
                {editingId ? "作品を編集" : "作品を追加"}
              </h2>
              {error && <p className="shelf-error">{error}</p>}
              <label className="shelf-field">
                タイトル
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
                種類
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
                  <option value="anime">アニメ</option>
                  <option value="drama">ドラマ</option>
                </select>
              </label>
              <button className="shelf-form-submit" onClick={handleAdd}>
                {editingId ? "変更を保存" : "追加する"}
              </button>
            </div>
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
                  <p className="my-shelf-item-creator">{item.creator || "作者不明"}</p>
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
