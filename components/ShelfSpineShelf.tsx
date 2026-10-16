"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { MediaItem } from "../types/media";
import { SHELF_TYPE_LABEL } from "../utils/shelfDisplay";
import { spineAppearance } from "../utils/spineAppearance";

const GAP = 6;

type ShelfSpineShelfProps = {
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
};

function packRows(items: MediaItem[], width: number) {
  if (items.length === 0) return [];
  if (width <= 0) return [items];

  const rows: MediaItem[][] = [];
  let row: MediaItem[] = [];
  let used = 0;

  for (const item of items) {
    const slot = spineAppearance(item.id, item.type).slotWidth;
    const next = row.length === 0 ? slot : used + GAP + slot;
    if (row.length > 0 && next > width) {
      rows.push(row);
      row = [item];
      used = slot;
    } else {
      row.push(item);
      used = next;
    }
  }

  if (row.length > 0) rows.push(row);
  return rows;
}

function rowSignature(rows: MediaItem[][]) {
  return rows.map((row) => row.map((item) => item.id).join(",")).join("/");
}

export default function ShelfSpineShelf({
  items,
  onOpen,
}: ShelfSpineShelfProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [rows, setRows] = useState<MediaItem[][]>(() => [items]);
  const layoutKey = items.map((item) => `${item.id}:${item.type}`).join("|");

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const pack = () => {
      const next = packRows(itemsRef.current, board.clientWidth);
      setRows((current) =>
        rowSignature(current) === rowSignature(next) ? current : next
      );
    };

    pack();
    const observer = new ResizeObserver(pack);
    observer.observe(board);
    return () => observer.disconnect();
  }, [layoutKey]);

  if (items.length === 0) return null;

  const currentById = new Map(items.map((item) => [item.id, item]));

  return (
    <div
      ref={boardRef}
      className="spine-board"
    >
      {rows.map((row) => (
        <div className="spine-row" key={row.map((item) => item.id).join("-")}>
          <div className="spine-row-items">
            {row.map((packed) => {
              const item = currentById.get(packed.id) ?? packed;
              const look = spineAppearance(item.id, item.type);
              const creator = item.creator?.trim() || "作者不明";
              const genre = SHELF_TYPE_LABEL[item.type] ?? "作品";
              return (
                <div
                  key={item.id}
                  className="spine-slot"
                  style={{ width: look.slotWidth }}
                >
                  <button
                    type="button"
                    className="spine-open"
                    aria-label={`${item.title}、${creator}、${genre}。作品詳細を開く`}
                    onClick={() => onOpen(item)}
                  >
                    <span
                      className={`spine-face spine-face--${look.form} spine-motif--${look.motif} spine-align--${look.align}`}
                      aria-hidden="true"
                      style={{
                        width: look.width,
                        height: look.height,
                        backgroundColor: look.background,
                        color: look.ink,
                      }}
                    >
                      <span
                        className={`spine-title${
                          look.writing === "horizontal"
                            ? " is-horizontal"
                            : " is-vertical"
                        }`}
                      >
                        {item.title}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="spine-plank" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
