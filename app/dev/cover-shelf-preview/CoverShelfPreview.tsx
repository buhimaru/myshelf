"use client";

import { useState } from "react";
import CoverShelf from "../../../components/CoverShelf";
import styles from "../../../components/CoverShelf.module.css";
import ShelfItemDetail from "../../../components/ShelfItemDetail";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import { COVER_SHELF_RICH_ITEMS } from "./items";

const DEPTHS = [
  { id: false, label: "現状" },
  { id: true, label: "立体感改善" },
];

export default function CoverShelfPreview() {
  const [depth, setDepth] = useState(false);
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);

  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">表紙棚プレビュー</h1>
          <p className="my-shelf-desc">
            開発環境だけの確認用です。30作品は棚に保存されません。画像豊富の25件とダークウォールナットで、表紙の立体感だけを比べます。
          </p>
        </header>
        <div className={styles.switcher} role="group" aria-label="表紙の立体感">
          {DEPTHS.map((option) => (
            <button
              key={option.label}
              type="button"
              className={depth === option.id ? styles.switchOn : undefined}
              aria-pressed={depth === option.id}
              onClick={() => setDepth(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <CoverShelf
          items={COVER_SHELF_RICH_ITEMS}
          finish="walnut"
          depth={depth}
          onOpen={setDetailItem}
        />
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
