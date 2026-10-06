"use client";

import { useState } from "react";
import { mediaItems } from "../data/media";
import type { MediaType } from "../types/media";

export default function Home() {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [type, setType] = useState<MediaType | "">("");
  const [items, setItems] = useState(mediaItems);
  const [error, setError] = useState("");
  
  
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
  
    setItems([...items, newItem]);
    setTitle("");
    setCreator("");
    setType("");
    setShowForm(false);
  };
  const handleDelete = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };
  return (
    <main>
      <h1>myshelf</h1>
      <p>好きな作品を、自分だけの棚に。</p>

      <button
  onClick={() => {
    setShowForm(!showForm);
    setError("");
  }}
>
        {showForm ? "閉じる" : "＋ 作品を追加"}
      </button>

      {showForm && (
        <div>
          <h2>作品を追加</h2>
          {error && <p>{error}</p>}
          <label>
            タイトル
            <input
  type="text"
  placeholder="作品名を入力"
  value={title}
  onChange={(e) => setTitle(e.target.value)}
/>
          </label>

          <br />

          <label>
            作者・監督・アーティスト
            <input
  type="text"
  placeholder="名前を入力"
  value={creator}
  onChange={(e) => setCreator(e.target.value)}
/>
          </label>

          <br />

          <label>
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
          <br />

<button onClick={handleAdd}>
  追加する
</button>
        </div>
      )}

      <h2>作品一覧</h2>

      {items.map((item) => (
        <div key={item.id} style={{ marginBottom: "20px" }}>
          <h3>{item.title}</h3>
          <p>{item.creator}</p>
          <p>{item.type}</p>
          <button onClick={() => handleDelete(item.id)}>
  削除
</button>
        </div>
      ))}
    </main>
  );
}