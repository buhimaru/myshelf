"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MediaItem } from "../types/media";
import { useLockBodyScroll } from "./useLockBodyScroll";

type ShelfItemDetailProps = {
  item: MediaItem;
  genreLabel: string;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};

export default function ShelfItemDetail({
  item,
  genreLabel,
  onClose,
  onEdit,
  onDelete,
}: ShelfItemDetailProps) {
  const [mounted, setMounted] = useState(false);
  useLockBodyScroll(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  const creator = item.creator?.trim() || "作者不明";
  const description = item.description?.trim() ?? "";

  return createPortal(
    <div className="shelf-detail-backdrop" onClick={onClose}>
      <div
        className="shelf-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shelf-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="shelf-detail-close"
          onClick={onClose}
          autoFocus
        >
          閉じる
        </button>
        <div className={`shelf-detail-layout my-shelf-item--${item.type}`}>
          <div className="my-shelf-cover shelf-detail-cover">
            <div className="my-shelf-cover-fallback" aria-hidden="true">
              <span>{genreLabel}</span>
            </div>
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            )}
          </div>
          <div className="shelf-detail-copy">
            <h2 id="shelf-detail-title" className="shelf-detail-title">
              {item.title}
            </h2>
            <p className="shelf-detail-creator">{creator}</p>
            <p className="shelf-detail-genre">{genreLabel}</p>
          </div>
        </div>
        <section className="shelf-detail-section" aria-label="紹介文">
          <h3 className="shelf-detail-heading">紹介文</h3>
          {description ? (
            <p className="shelf-detail-description">{description}</p>
          ) : (
            <p className="shelf-detail-description shelf-detail-description--empty">
              紹介文はありません
            </p>
          )}
        </section>
        {onEdit && onDelete && (
          <div className="shelf-detail-actions">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(item.id);
              }}
            >
              編集
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(item.id);
              }}
            >
              削除
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
