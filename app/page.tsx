"use client";

import { useEffect, useState } from "react";
import { mediaItems } from "../data/media";
import type { MediaType } from "../types/media";
import { createClient } from "../utils/supabase/client";

export default function Home() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  console.log("current user:", user);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [type, setType] = useState<MediaType | "">("");
  const [items, setItems] = useState<typeof mediaItems>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
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
 
  const handleAdd = async () => {
    if (type === "") {
      setError("カテゴリーを選択してください");
      return;
    };
    if (title.trim() === "") {
      setError("作品名を入力してください");
      return;
    }
    if (creator.trim() === "") {
      setError("作者・監督・アーティスト名を入力してください");
      return;
    }
    setError("");
    if (!user) {
      setError("ログインしてください");
      return;
    }
    const newItem = {
      id: crypto.randomUUID(),
      title: title,
      creator: creator,
      type: type,
      imageUrl: imageUrl,
    };
  
    if (editingId) {
      const { error: updateError } = await supabase
  .from("items")
  .update({
    title: title,
    creator: creator,
    category: type,
    image_url: imageUrl,
  })
  .eq("id", editingId)
  .eq("user_id", user.id);
  if (updateError) {
    setError(updateError.message);
    return;
  }
  setItems( items.map((item) =>
        item.id === editingId
  ? { ...item, title: title, creator: creator, type: type, imageUrl: imageUrl }
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
    title: title,
    category: type,
    creator: creator,
    image_url: imageUrl,
    user_id: user.id,
  })
  .select()
  .single();
  
  if (insertError) {
    setError(insertError.message);
    return;
  }
  setItems([...items, data]);
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
  
    console.log("signup:", data, error);
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
  return (
    <main className="shelf">
      {!user && (
  <button onClick={() => setShowAuth(true)}>
    ログイン / 新規登録
  </button>
)}
{user && <p>ログイン中：{user.email}</p>}
{user && <button onClick={handleSignOut}>ログアウト</button>}
{showAuth && (
  <div>
    <h2>ログイン / 新規登録</h2>

    <input
      type="email"
      placeholder="メールアドレス"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />

    <input
      type="password"
      placeholder="パスワード"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
    />
    <button onClick={handleSignUp}>
  新規登録
</button>
<button onClick={handleSignIn}>
  ログイン
</button>
  </div>
)}
      <header className="shelf-header">
        <h1 className="shelf-title">myshelf</h1>
        <p className="shelf-lead">好きな作品を、自分だけの棚に。</p>

        <button
          className={`btn-primary${showForm ? " is-close" : ""}`}
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setTitle("");
setCreator("");
setType("");
            setError("");
          }}
        >
          {showForm ? "閉じる" : "＋ 作品を追加"}
        </button>
      </header>

      {showForm && (
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
            作者・監督・アーティスト
            <input
              type="text"
              placeholder="名前を入力"
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
            />
          </label>
          <label className="shelf-field">
  画像URL
  <input
    type="text"
    placeholder="画像URLを入力"
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
              <option value="movie">映画</option>
              <option value="music">音楽</option>
              <option value="anime">アニメ</option>
              <option value="drama">ドラマ</option>
            </select>
          </label>

          <button className="shelf-form-submit" onClick={handleAdd}>
          {editingId ? "変更を保存" : "追加する"}
          </button>
        </div>
      )}

      <h2 className="shelf-section-title">作品一覧</h2>

      <div className="shelf-list">
        {items.map((item) => (
          <div key={item.id} className={`shelf-card shelf-card--${item.type}`}>
            <div className="shelf-card-image">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} />
              ) : (
                "NO IMAGE"
              )}
            </div>
            <div className="shelf-card-content">
            <h3 className="shelf-card-title">{item.title}</h3>
            <p className="shelf-card-creator">{item.creator}</p>
            <p className="shelf-card-type">
  {{
    book: "本",
    movie: "映画",
    music: "音楽",
    anime: "アニメ",
    drama: "ドラマ",
  }[item.type]}
</p>
            <div className="shelf-card-actions">
              <button className="btn-edit" onClick={() => handleEdit(item.id)}>
                編集
              </button>
              <button className="btn-delete" onClick={() => handleDelete(item.id)}>
                削除
              </button>
            </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
