"use client";

import React, { useState } from "react";
// 型エラーを確実に回避するためダイナミックインポート的な指定にします
import * as MediaLookupModule from "@/components/media-lookup-controls";
import { addGuestWork, readGuestShelf } from "@/lib/guest-shelf";

// exportが default か named かのどちらでも対応できるようにコンポーネントを取得
const MediaLookupControls: any =
  (MediaLookupModule as any).MediaLookupControls ||
  (MediaLookupModule as any).default ||
  MediaLookupModule;

export type CatalogSearchSectionProps = {
  onAdd?: () => void;
  onAdded?: () => void;
};

export function CatalogSearchSection({ onAdd, onAdded }: CatalogSearchSectionProps) {
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const handleAdd = (item: any) => {
    const currentShelf = readGuestShelf();
    const isAlreadyAdded = currentShelf.some(
      (w) => w.id === `guest-${item.id}` || w.title === item.title
    );

    if (isAlreadyAdded) {
      setMessage(`「${item.title}」はすでに仮棚にあります。`);
      return;
    }

    const imgUrl = item.imageUrl || item.image_url || item.poster_path || item.cover || null;

    addGuestWork({
      id: `guest-${item.id}`,
      title: item.title,
      category: item.category || "movie",
      description: item.description || "",
      imageUrl: imgUrl,
      image_url: imgUrl,
    });

    setAddedIds((current) =>
      current.includes(item.id) ? current : [...current, item.id]
    );

    setMessage(`「${item.title}」を仮棚に追加しました。`);

    if (onAdded) {
      onAdded();
    } else if (onAdd) {
      onAdd();
    }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-card">
      <h2 className="text-lg font-bold">作品を検索して追加</h2>
      <MediaLookupControls onSelect={handleAdd} addedIds={addedIds} />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

export default CatalogSearchSection;