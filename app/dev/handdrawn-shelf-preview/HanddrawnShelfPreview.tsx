"use client";

import { useState } from "react";
import HanddrawnShelf from "../../../components/HanddrawnShelf";
import ShelfItemDetail from "../../../components/ShelfItemDetail";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import { COVER_SHELF_RICH_ITEMS } from "../cover-shelf-preview/items";

export default function HanddrawnShelfPreview() {
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);

  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">手描き棚プレビュー</h1>
          <p className="my-shelf-desc">
            開発環境だけの確認用です。クリーム色の手描き棚で、仮の30作品を表紙のまま並べます。棚には保存されません。
          </p>
        </header>
        <HanddrawnShelf items={COVER_SHELF_RICH_ITEMS} onOpen={setDetailItem} />
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
