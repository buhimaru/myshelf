"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { MediaItem, MediaType } from "../types/media";
import { SHELF_TYPE_LABEL } from "../utils/shelfDisplay";
import { shelfItemAriaLabel } from "../utils/tmdb/credits";
import { spineAppearance } from "../utils/spineAppearance";
import styles from "./HanddrawnShelf.module.css";
import { HanddrawnBack, HanddrawnPlank, HanddrawnSide } from "./handdrawn/shelfArt";

const GAP = 12;

type HanddrawnShelfProps = {
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
};

function faceSize(id: string, type: MediaType) {
  const form = spineAppearance(id, type).form;
  if (form === "lp") return { width: 112, height: 112 };
  if (form === "cd") return { width: 92, height: 92 };
  if (form === "game") return { width: 84, height: 118 };
  if (form === "manga") return { width: 76, height: 120 };
  if (form === "dvd" || form === "bluray") return { width: 80, height: 120 };
  return { width: 82, height: 124 };
}

function packRows(items: MediaItem[], width: number) {
  if (items.length === 0) return [];
  if (width <= 0) return [items];

  const rows: MediaItem[][] = [];
  let row: MediaItem[] = [];
  let used = 0;

  for (const item of items) {
    const slot = faceSize(item.id, item.type).width;
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

export default function HanddrawnShelf({ items, onOpen }: HanddrawnShelfProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [rows, setRows] = useState<MediaItem[][]>(() => [items]);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const layoutKey = items.map((item) => `${item.id}:${item.type}`).join("|");

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const pack = () => {
      const sample = board.querySelector("[data-handdrawn-items]");
      const sampleStyle = sample ? getComputedStyle(sample) : null;
      const pad = sampleStyle
        ? parseFloat(sampleStyle.paddingLeft) + parseFloat(sampleStyle.paddingRight)
        : 16;
      const next = packRows(
        itemsRef.current,
        board.clientWidth - (Number.isFinite(pad) ? pad : 16)
      );
      setRows((current) => (rowSignature(current) === rowSignature(next) ? current : next));
    };

    pack();
    const observer = new ResizeObserver(pack);
    observer.observe(board);
    return () => observer.disconnect();
  }, [layoutKey]);

  if (items.length === 0) return null;

  const currentById = new Map(items.map((item) => [item.id, item]));

  return (
    <div className={styles.case}>
      <div className={styles.back}>
        <HanddrawnBack />
      </div>
      <div className={`${styles.side} ${styles.sideLeft}`}>
        <HanddrawnSide />
      </div>
      <div className={`${styles.side} ${styles.sideRight}`}>
        <HanddrawnSide />
      </div>
      <div ref={boardRef} className={styles.board}>
        <div className={styles.top}>
          <HanddrawnPlank />
        </div>
        {rows.map((row) => (
          <div className={styles.row} key={row.map((item) => item.id).join("-")}>
            <div className={styles.items} data-handdrawn-items="">
              {row.map((packed) => {
                const item = currentById.get(packed.id) ?? packed;
                const face = faceSize(item.id, item.type);
                const genre = SHELF_TYPE_LABEL[item.type] ?? "作品";
                const showImage = Boolean(item.imageUrl) && !failed.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.open}
                    style={{ width: face.width }}
                    aria-label={shelfItemAriaLabel({
                      title: item.title,
                      creator: item.creator,
                      type: item.type,
                      genreLabel: genre,
                    })}
                    onClick={() => onOpen(item)}
                  >
                    <span className={styles.face} style={{ width: face.width, height: face.height }}>
                      {showImage ? (
                        <img
                          className={styles.image}
                          src={item.imageUrl}
                          alt=""
                          onError={() =>
                            setFailed((current) => {
                              const next = new Set(current);
                              next.add(item.id);
                              return next;
                            })
                          }
                        />
                      ) : (
                        <span className={styles.fallback}>
                          <span className={styles.genre}>{genre}</span>
                          <span className={styles.title}>{item.title}</span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={styles.plank}>
              <HanddrawnPlank />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
