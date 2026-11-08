"use client";

import { useState } from "react";
import CoverShelf, { type CoverShelfFinish } from "../../../components/CoverShelf";
import styles from "../../../components/CoverShelf.module.css";
import SvgShelfFrame from "../../../components/SvgShelfFrame";
import ShelfItemDetail from "../../../components/ShelfItemDetail";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import { COVER_SHELF_RICH_ITEMS } from "./items";

const LOOKS = [
  { id: "plain", label: "現状" },
  { id: "cabinet", label: "家具の奥行き" },
  { id: "interior", label: "奥の陰影改善" },
  { id: "structure", label: "立体の接合" },
  { id: "viewpoint", label: "視点の遠近" },
  { id: "svg", label: "SVG骨格" },
] as const;

const WOODS: { id: CoverShelfFinish; label: string }[] = [
  { id: "oak", label: "明るい木目" },
  { id: "walnut", label: "ダークウォールナット" },
];

export default function CoverShelfPreview() {
  const [look, setLook] = useState<(typeof LOOKS)[number]["id"]>("viewpoint");
  const [finish, setFinish] = useState<CoverShelfFinish>("oak");
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);

  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">表紙棚プレビュー</h1>
          <p className="my-shelf-desc">
            開発環境だけの確認用です。30作品は棚に保存されません。家具の奥行きと、各段の奥の陰影を比べます。
          </p>
        </header>
        <div className={styles.switcher} role="group" aria-label="家具の奥行き">
          {LOOKS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={look === option.id ? styles.switchOn : undefined}
              aria-pressed={look === option.id}
              onClick={() => setLook(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.switcher} role="group" aria-label="木材の色">
          {WOODS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={finish === option.id ? styles.switchOn : undefined}
              aria-pressed={finish === option.id}
              onClick={() => setFinish(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {look === "svg" ? (
          <SvgShelfFrame />
        ) : (
          <CoverShelf
            items={COVER_SHELF_RICH_ITEMS}
            finish={finish}
            depth
            cabinet={look !== "plain"}
            interior={look === "interior"}
            structure={look === "structure"}
            viewpoint={look === "viewpoint"}
            onOpen={setDetailItem}
          />
        )}
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
