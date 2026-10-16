"use client";

import { useState } from "react";
import ShelfItemDetail from "../../../components/ShelfItemDetail";
import ShelfSpineShelf from "../../../components/ShelfSpineShelf";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import { SPINE_PREVIEW_ITEMS } from "./items";

export default function SpinePreview() {
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);

  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">背表紙プレビュー</h1>
          <p className="my-shelf-desc">
            開発環境だけの確認用です。30作品は仮データで、棚には保存されません。
          </p>
        </header>
        <ShelfSpineShelf items={SPINE_PREVIEW_ITEMS} onOpen={setDetailItem} />
      </main>
      {detailItem && (
        <ShelfItemDetail
          item={detailItem}
          genreLabel={SHELF_TYPE_LABEL[detailItem.type] ?? detailItem.type}
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  );
}
