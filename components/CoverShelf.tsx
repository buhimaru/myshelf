"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MediaItem, MediaType } from "../types/media";
import { SHELF_TYPE_LABEL } from "../utils/shelfDisplay";
import { spineAppearance } from "../utils/spineAppearance";
import styles from "./CoverShelf.module.css";

const GAP = 12;

type CoverKind = "book" | "manga" | "poster" | "cd" | "lp" | "game";

type CoverFace = {
  kind: CoverKind;
  width: number;
  height: number;
};

export type CoverShelfFinish = "matte" | "walnut" | "oak" | "blackOak" | "cafe";

type CoverShelfProps = {
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
  finish?: CoverShelfFinish;
  depth?: boolean;
};

function hashId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(hash: number, salt: number) {
  const mixed = Math.imul(hash ^ salt, 2246822519) >>> 0;
  return (mixed % 1000) / 1000;
}

function pick(hash: number, salt: number, min: number, max: number) {
  return Math.round(min + unit(hash, salt) * (max - min));
}

function coverFace(id: string, type: MediaType): CoverFace {
  const hash = hashId(id);
  const form = spineAppearance(id, type).form;

  if (form === "lp") {
    const width = pick(hash, 3, 104, 120);
    return { kind: "lp", width, height: width };
  }
  if (form === "cd") {
    const width = pick(hash, 3, 86, 100);
    return { kind: "cd", width, height: width };
  }
  if (form === "dvd" || form === "bluray") {
    return {
      kind: "poster",
      width: pick(hash, 3, 72, 88),
      height: pick(hash, 5, 108, 136),
    };
  }
  if (form === "game") {
    return {
      kind: "game",
      width: pick(hash, 3, 78, 96),
      height: pick(hash, 5, 104, 128),
    };
  }
  if (form === "manga") {
    return {
      kind: "manga",
      width: pick(hash, 3, 68, 84),
      height: pick(hash, 5, 112, 144),
    };
  }
  return {
    kind: "book",
    width: pick(hash, 3, 74, 92),
    height: pick(hash, 5, 112, 142),
  };
}

function packRows(items: MediaItem[], width: number, gap: number) {
  if (items.length === 0) return [];
  if (width <= 0) return [items];

  const rows: MediaItem[][] = [];
  let row: MediaItem[] = [];
  let used = 0;

  for (const item of items) {
    const slot = coverFace(item.id, item.type).width;
    const next = row.length === 0 ? slot : used + gap + slot;
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

function coverCaption(item: MediaItem) {
  const title = item.title.trim();
  const creator = item.creator?.trim() ?? "";
  if (item.type === "music" && creator && title) return `${creator} — ${title}`;
  if (item.type === "music" && creator) return creator;
  return title;
}

const FINE_HOVER = "(hover: hover) and (pointer: fine)";
const keyboardNav = { current: false };
let modalityListening = false;

function ensureModalityListener() {
  if (modalityListening || typeof window === "undefined") return;
  modalityListening = true;
  window.addEventListener("keydown", (event) => {
    if (event.key === "Tab") keyboardNav.current = true;
  });
  window.addEventListener("pointerdown", () => {
    keyboardNav.current = false;
  });
}

function positionTip(button: HTMLElement, tip: HTMLElement) {
  const margin = 8;
  const gap = 6;
  const rect = button.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  let left = rect.left + rect.width / 2 - width / 2;
  const maxLeft = window.innerWidth - width - margin;
  left = Math.max(margin, Math.min(left, Math.max(margin, maxLeft)));
  let top = rect.top - height - gap;
  if (top < margin) {
    const below = rect.bottom + gap;
    top =
      below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, window.innerHeight - height - margin);
  }
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

export default function CoverShelf({
  items,
  onOpen,
  finish = "oak",
  depth = false,
}: CoverShelfProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [rows, setRows] = useState<MediaItem[][]>(() => [items]);
  const [failedCovers, setFailedCovers] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const layoutKey = items.map((item) => `${item.id}:${item.type}`).join("|");
  const [mounted, setMounted] = useState(false);
  const [tipTarget, setTipTarget] = useState<{
    text: string;
    button: HTMLButtonElement;
  } | null>(null);
  const tipNode = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMounted(true);
    ensureModalityListener();
  }, []);

  useLayoutEffect(() => {
    const button = tipTarget?.button;
    const tip = tipNode.current;
    if (!button || !tip) return;
    const place = () => {
      if (!button.isConnected) {
        setTipTarget(null);
        return;
      }
      positionTip(button, tip);
      tip.dataset.placed = "true";
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      delete tip.dataset.placed;
    };
  }, [tipTarget]);

  const showTip = (button: HTMLButtonElement, text: string) => {
    setTipTarget((current) =>
      current?.button === button && current.text === text
        ? current
        : { button, text }
    );
  };

  const hideTip = (button: HTMLButtonElement) => {
    const fineHover = window.matchMedia(FINE_HOVER).matches;
    if (fineHover && button.matches(":hover")) return;
    if (button.matches(":focus-visible")) return;
    if (keyboardNav.current && document.activeElement === button) return;
    setTipTarget((current) => (current?.button === button ? null : current));
  };

  const markCoverFailed = (key: string) => {
    setFailedCovers((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const pack = () => {
      const itemsBox = board.querySelector("[data-cover-items]");
      const box = itemsBox instanceof HTMLElement ? itemsBox : board;
      const style = getComputedStyle(box);
      const inset =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const gap = Number.parseFloat(style.columnGap);
      const next = packRows(
        itemsRef.current,
        box.clientWidth - inset,
        Number.isFinite(gap) ? gap : GAP
      );
      setRows((current) =>
        rowSignature(current) === rowSignature(next) ? current : next
      );
    };

    pack();
    const observer = new ResizeObserver(pack);
    observer.observe(board);
    return () => observer.disconnect();
  }, [layoutKey, finish]);

  if (items.length === 0) return null;

  const currentById = new Map(items.map((item) => [item.id, item]));

  return (
    <div
      className={`${styles.case} ${styles.framed} ${styles[finish]} ${
        depth ? styles.bodied : ""
      }`}
    >
      <div className={styles.back} aria-hidden="true" />
      <div className={`${styles.side} ${styles.sideLeft}`} aria-hidden="true" />
      <div className={`${styles.side} ${styles.sideRight}`} aria-hidden="true" />
      <div className={styles.top} aria-hidden="true" />
      <div ref={boardRef} className={styles.board}>
      {rows.map((row) => (
        <div className={styles.row} key={row.map((item) => item.id).join("-")}>
          <div className={styles.items} data-cover-items="">
            {row.map((packed) => {
              const item = currentById.get(packed.id) ?? packed;
              const face = coverFace(item.id, item.type);
              const creator = item.creator?.trim() || "作者不明";
              const genre = SHELF_TYPE_LABEL[item.type] ?? "作品";
              const coverKey = `${item.id}\0${item.imageUrl ?? ""}`;
              const showImage = Boolean(item.imageUrl) && !failedCovers.has(coverKey);
              const caption = coverCaption(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.open}
                  style={{ width: face.width }}
                  aria-label={`${item.title}、${creator}、${genre}。作品詳細を開く`}
                  onClick={() => onOpen(item)}
                  onMouseEnter={(event) => {
                    if (!showImage || !caption) return;
                    if (!window.matchMedia(FINE_HOVER).matches) return;
                    showTip(event.currentTarget, caption);
                  }}
                  onMouseLeave={(event) => hideTip(event.currentTarget)}
                  onFocus={(event) => {
                    if (!showImage || !caption) return;
                    const button = event.currentTarget;
                    requestAnimationFrame(() => {
                      if (!button.isConnected) return;
                      if (!button.matches(":focus-visible") && !keyboardNav.current) return;
                      showTip(button, caption);
                    });
                  }}
                  onBlur={(event) => hideTip(event.currentTarget)}
                >
                  <span
                    className={`${styles.face} ${styles[face.kind]} ${
                      showImage ? styles.hasImage : ""
                    }`}
                    style={{ width: face.width, height: face.height }}
                  >
                    {depth && <span className={styles.edge} aria-hidden="true" />}
                    <span className={styles.fallback}>
                      <span className={styles.genre}>{genre}</span>
                      <span className={styles.title}>{item.title}</span>
                    </span>
                    {showImage && (
                      <img
                        className={styles.image}
                        src={item.imageUrl}
                        alt=""
                        onError={() => markCoverFailed(coverKey)}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className={styles.plank} aria-hidden="true" />
        </div>
      ))}
    </div>
    {mounted &&
      tipTarget &&
      createPortal(
        <span ref={tipNode} className={styles.tip} aria-hidden="true">
          {tipTarget.text}
        </span>,
        document.body
      )}
    </div>
  );
}
