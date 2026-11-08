"use client";

import { useState } from "react";
import LineShelf from "../../../components/LineShelf";
import ShelfItemDetail from "../../../components/ShelfItemDetail";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import { COVER_SHELF_RICH_ITEMS } from "../cover-shelf-preview/items";

export default function LineShelfPreview() {
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);

  return (
    <main style={{ background: "#ffffff", minHeight: "100vh" }}>
      <LineShelf items={COVER_SHELF_RICH_ITEMS} onOpen={setDetailItem} />
      {detailItem && (
        <ShelfItemDetail
          item={detailItem}
          genreLabel={SHELF_TYPE_LABEL[detailItem.type] ?? detailItem.type}
          onClose={() => setDetailItem(null)}
        />
      )}
    </main>
  );
}
