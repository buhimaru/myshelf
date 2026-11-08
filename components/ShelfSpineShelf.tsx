"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { MediaItem } from "../types/media";
import { SHELF_TYPE_LABEL } from "../utils/shelfDisplay";
import { shelfItemAriaLabel } from "../utils/tmdb/credits";
import { boardFaces } from "../utils/shelfViewpoint";
import { spineAppearance } from "../utils/spineAppearance";

const GAP = 6;

type ShelfWood = "oak" | "walnut";

type ShelfSpineShelfProps = {
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
  /** 木製の枠と背板。未指定の棚には出さない。 */
  cabinet?: boolean;
  /** 各段の内側の奥行き。枠の寸法は変えない。cabinet と一緒に使う。 */
  interior?: boolean;
  /** 側板・天板・棚板の面と、段ごとの陰影。枠の寸法は変えない。cabinet と一緒に使う。 */
  structure?: boolean;
  /** 中央を目の高さにした横板の見え方。cabinet と一緒に使う。 */
  viewpoint?: boolean;
  finish?: ShelfWood;
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
  cabinet = false,
  interior = false,
  structure = false,
  viewpoint = false,
  finish = "oak",
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

  const woodClass = finish === "walnut" ? "is-walnut" : "is-oak";
  const board = (
    <div
      ref={boardRef}
      className={cabinet ? "spine-board" : `spine-board ${woodClass}`}
    >
      {rows.map((row, rowIndex) => {
        const faces = boardFaces(rowIndex + 1, rows.length + 1);
        return (
        <div
          className="spine-row"
          key={row.map((item) => item.id).join("-")}
          style={
            cabinet && viewpoint
              ? {
                  ["--board-front" as string]: `${faces.front}px`,
                  ["--board-under" as string]: `${faces.under}px`,
                  ["--board-deck" as string]: `${faces.deck}px`,
                }
              : undefined
          }
        >
          <div className="spine-row-items">
            {row.map((packed) => {
              const item = currentById.get(packed.id) ?? packed;
              const look = spineAppearance(item.id, item.type);
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
                    aria-label={shelfItemAriaLabel({
                      title: item.title,
                      creator: item.creator,
                      type: item.type,
                      genreLabel: genre,
                    })}
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
          <div
            className={
              cabinet
                ? `spine-plank is-set${faces.deck ? " is-deck" : ""}${
                    faces.under ? " is-under" : ""
                  }`
                : "spine-plank"
            }
            aria-hidden="true"
          />
        </div>
        );
      })}
    </div>
  );

  if (!cabinet) return board;

  return (
    <div
      className={`spine-case ${woodClass}${cabinet && interior ? " is-interior" : ""}${
        cabinet && structure ? " is-structure" : ""
      }${cabinet && viewpoint ? " is-viewpoint" : ""}`}
      style={
        viewpoint
          ? {
              ["--board-front" as string]: `${boardFaces(0, rows.length + 1).front}px`,
              ["--board-under" as string]: `${boardFaces(0, rows.length + 1).under}px`,
            }
          : undefined
      }
    >
      <div className="spine-case-back" aria-hidden="true" />
      <div className="spine-case-side is-left" aria-hidden="true" />
      <div className="spine-case-side is-right" aria-hidden="true" />
      <div className="spine-case-top" aria-hidden="true" />
      {board}
    </div>
  );
}
