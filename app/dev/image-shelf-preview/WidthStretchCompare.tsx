"use client";

/**
 * 正式採用B（LED右端固定 7-6-6-6）の配置を複製し、
 * 表示だけを横方向 100 / 105 / 110 / 115% で比較する。
 * 中心Xと下端Yは動かさない。layoutLedRight と本番ImageShelfは変更しない。
 */

import Image from "next/image";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import {
  IMAGE_SHELF_BG,
  isNearImageShelfLed,
} from "../../../utils/imageShelfLayout";
import { COVER_SHELF_RICH_ITEMS } from "../cover-shelf-preview/items";
import shelf from "./IntrinsicPackCompare.module.css";
import {
  A_SLOT_SIZE,
  EVEN_BANDS,
  type PackedItem,
  type VisualSize,
  aVisualSize,
  packToPercent,
} from "./intrinsicPackLayout";
import { LED_LUMINOUS_CENTER_X } from "./ledAnchorLayout";
import { layoutLedRight } from "./ledRightLayout";
import styles from "./LedAnchorCompare.module.css";
import local from "./WidthStretchCompare.module.css";

const ONE_PIECE_ID = "spine-preview-manga-1";

const VARIANTS = [
  { id: "current", label: "現状：横方向100%", scale: 1 },
  { id: "a", label: "A案：横方向105%", scale: 1.05 },
  { id: "b", label: "B案：横方向110%", scale: 1.1 },
  { id: "c", label: "C案：横方向115%", scale: 1.15 },
] as const;

type NaturalSize = { width: number; height: number };

type StretchBox = PackedItem & { centerX: number; bottom: number };

type OverlapHit = {
  bay: number;
  left: string;
  right: string;
  overlap: number;
};

function stretch(box: PackedItem, scale: number): StretchBox {
  const centerX = box.x + box.width / 2;
  const width = box.width * scale;
  return {
    ...box,
    x: centerX - width / 2,
    width,
    centerX,
    bottom: box.y + box.height,
  };
}

function findOverlaps(
  placed: readonly PackedItem[],
  items: readonly MediaItem[],
  scale: number
): OverlapHit[] {
  const hits: OverlapHit[] = [];
  for (const band of EVEN_BANDS) {
    const row = placed
      .filter((item) => item.bay === band.bay)
      .sort((a, b) => a.index - b.index);
    for (let slot = 1; slot < row.length; slot++) {
      const prev = stretch(row[slot - 1]!, scale);
      const cur = stretch(row[slot]!, scale);
      const overlap = prev.x + prev.width - cur.x;
      if (overlap > 0.5) {
        hits.push({
          bay: band.bay,
          left: items[row[slot - 1]!.index]?.title ?? "",
          right: items[row[slot]!.index]?.title ?? "",
          overlap,
        });
      }
    }
  }
  return hits;
}

function CoverFace({
  item,
  slotBox,
  bay,
  nearLed,
  onOpen,
  onNatural,
}: {
  item: MediaItem;
  slotBox: { x: number; y: number; width: number; height: number };
  bay: number;
  nearLed: boolean;
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  const pct = packToPercent(slotBox);
  const genre = SHELF_TYPE_LABEL[item.type] ?? "作品";
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      onNatural(item.id, {
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    }
  };

  return (
    <button
      type="button"
      className={`${shelf.coverBtn}${item.imageUrl ? "" : ` ${shelf.coverBtnText}`}${nearLed ? ` ${shelf.coverNearLed}` : ""}`}
      style={{
        left: pct.left,
        top: pct.top,
        width: pct.width,
        height: pct.height,
      }}
      onClick={() => onOpen(item)}
      aria-label={`${item.title}の詳細を開く`}
      data-bay={bay}
      data-width={slotBox.width.toFixed(2)}
      data-height={slotBox.height.toFixed(2)}
      data-bottom={(slotBox.y + slotBox.height).toFixed(2)}
      data-center={(slotBox.x + slotBox.width / 2).toFixed(2)}
      data-title={item.title}
    >
      {item.imageUrl ? (
        <>
          <span className={shelf.coverShadow} aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt=""
            className={`${shelf.coverImg} ${local.stretchImg}`}
            draggable={false}
            onLoad={onLoad}
          />
          <span className={shelf.coverLight} aria-hidden />
        </>
      ) : (
        <>
          <span className={shelf.coverShadow} aria-hidden />
          <span className={shelf.coverFallback}>
            <span className={shelf.coverFallbackLabel}>NO IMAGE</span>
            <span className={shelf.coverFallbackTitle}>{item.title}</span>
            <span className={shelf.coverFallbackGenre}>{genre}</span>
          </span>
          <span className={shelf.coverLight} aria-hidden />
        </>
      )}
    </button>
  );
}

function ShelfPane({
  label,
  scale,
  placed,
  items,
  onOpen,
  onNatural,
}: {
  label: string;
  scale: number;
  placed: PackedItem[];
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  return (
    <div className={styles.stageWrap} data-width-scale={scale}>
      <p className={styles.stageLabel}>{label}</p>
      <div
        className={`${shelf.stage} ${local.stage}`}
        style={{
          aspectRatio: `${IMAGE_SHELF_BG.width} / ${IMAGE_SHELF_BG.height}`,
        }}
      >
        <Image
          src={IMAGE_SHELF_BG.src}
          alt=""
          width={IMAGE_SHELF_BG.width}
          height={IMAGE_SHELF_BG.height}
          className={shelf.bg}
          unoptimized
        />
        <div className={shelf.coverLayer} aria-label={label}>
          {placed.map((box) => {
            const item = items[box.index];
            if (!item) return null;
            const next = stretch(box, scale);
            return (
              <CoverFace
                key={`${scale}-${box.index}-${item.id}`}
                item={item}
                slotBox={next}
                bay={box.bay}
                nearLed={isNearImageShelfLed({
                  x: box.x,
                  width: box.width,
                  bay: box.bay,
                })}
                onOpen={onOpen}
                onNatural={onNatural}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

type WidthStretchCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function WidthStretchCompare({ onOpen }: WidthStretchCompareProps) {
  const [naturals, setNaturals] = useState<Record<string, NaturalSize>>({});

  useEffect(() => {
    const root = document.documentElement;
    const previousHeight = root.style.height;
    root.style.height = "auto";
    return () => {
      root.style.height = previousHeight;
    };
  }, []);

  const items = useMemo(
    () => COVER_SHELF_RICH_ITEMS.map((item) => ({ ...item })),
    []
  );

  const onNatural = (id: string, size: NaturalSize) => {
    setNaturals((prev) => {
      const cur = prev[id];
      if (cur && cur.width === size.width && cur.height === size.height) return prev;
      return { ...prev, [id]: size };
    });
  };

  const sizes = useMemo(
    () =>
      items.map((item): VisualSize => {
        if (!item.imageUrl) return { width: A_SLOT_SIZE, height: A_SLOT_SIZE };
        const natural = naturals[item.id];
        if (!natural) return { width: A_SLOT_SIZE, height: A_SLOT_SIZE };
        return aVisualSize(natural.width, natural.height);
      }),
    [items, naturals]
  );

  const layout = useMemo(() => layoutLedRight(sizes), [sizes]);
  const onePiece = items.findIndex((item) => item.id === ONE_PIECE_ID);
  const onePieceBox =
    onePiece >= 0
      ? layout.placed.find((box) => box.index === onePiece) ?? null
      : null;
  const anchor = layout.placed.filter((box) => box.bay === 1).at(-1) ?? null;
  const counts = [0, 1, 2, 3].map(
    (bay) => layout.placed.filter((item) => item.bay === bay).length
  );
  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;

  return (
    <div>
      <p className={styles.lead}>
        正式採用の「B：LED右端固定 7-6-6-6」と同じ25作品・同じ中心です。
        各作品の今の表示幅だけを、横方向に 100%、105%、110%、115% しています。
        高さ、下端、中心X、背景、LED、レコード、ネイビー背表紙は動かしていません。
        横だけ広げているので、絵柄の文字や人物も横に伸びます。
      </p>
      <div className={styles.stats}>
        <div>
          画像サイズ確定: {known} / {withImage}。冊数 {counts.join("-")}（合計{" "}
          {layout.placed.length}）。2段目右端の中心{" "}
          {anchor ? (anchor.x + anchor.width / 2).toFixed(1) : "—"}px（LED{" "}
          {LED_LUMINOUS_CENTER_X}px）。
        </div>
        {onePieceBox ? (
          <div>
            ONE PIECE の表示サイズ（高さは固定）:{" "}
            {VARIANTS.map((variant) => {
              const next = stretch(onePieceBox, variant.scale);
              return `${variant.label.split("：")[0]} ${next.width.toFixed(1)}×${next.height.toFixed(1)}`;
            }).join(" / ")}
          </div>
        ) : null}
        {layout.reason ? <div className={styles.warn}>{layout.reason}</div> : null}
      </div>

      <div className={styles.measure} aria-hidden>
        {items.map((item) =>
          item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={item.id}
              src={item.imageUrl}
              alt=""
              onLoad={(event) => {
                const img = event.currentTarget;
                onNatural(item.id, {
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
              }}
            />
          ) : null
        )}
      </div>

      <div className={local.grid}>
        {VARIANTS.map((variant) => {
          const hits = findOverlaps(layout.placed, items, variant.scale);
          return (
            <section key={variant.id}>
              <ShelfPane
                label={variant.label}
                scale={variant.scale}
                placed={layout.placed}
                items={items}
                onOpen={onOpen}
                onNatural={onNatural}
              />
              <p className={styles.meta}>
                {hits.length === 0
                  ? "作品同士の重なりはありません。座標は動かしていません。"
                  : `重なり ${hits.length}箇所。座標は変更していません。${hits
                      .map(
                        (hit) =>
                          `${hit.bay + 1}段目 ${hit.left} と ${hit.right} が ${hit.overlap.toFixed(1)}px`
                      )
                      .join("。")}`}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
