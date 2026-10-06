"use client";

import { useEffect, useState } from "react";
import { mediaItems } from "../data/media";
import type { MediaType } from "../types/media";

export default function Home() {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [type, setType] = useState<MediaType | "">("");
  const [items, setItems] = useState(mediaItems);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    const savedItems = localStorage.getItem("myshelf-items");
  
    if (savedItems) {
      setItems(JSON.parse(savedItems));
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
  
    localStorage.setItem("myshelf-items", JSON.stringify(items));
  }, [items, loaded]);
  
  const handleAdd = () => {
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
    
    const newItem = {
      id: crypto.randomUUID(),
      title: title,
      creator: creator,
      type: type,
    };
    if (editingId) {setItems(
      items.map((item) =>
        item.id === editingId
          ? { ...item, title: title, creator: creator, type: type }
          : item
      )
    );
    setTitle("");
    setCreator("");
    setType("");
    setEditingId(null);
    setShowForm(false);
      return;
    }
    setItems([...items, newItem]);
    setTitle("");
    setCreator("");
    setType("");
    setShowForm(false);
    setError("");
  };
  const handleDelete = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };
  const handleEdit = (id: string) => {
    setEditingId(id);
    const item = items.find((item) => item.id === id);
    if (!item) return;

    setTitle(item.title);
    setCreator(item.creator ?? "");
    setType(item.type);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
setError("");
  };
  return (
    <main className="shelf">
      <header className="shelf-header">
        <h1 className="shelf-title">myshelf</h1>
        <p className="shelf-lead">好きな作品を、自分だけの棚に。</p>

        <button
          className={`btn-primary${showForm ? " is-close" : ""}`}
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
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
          <div key={item.id} className="shelf-card">
            <div className="shelf-card-image">NO IMAGE</div>
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
