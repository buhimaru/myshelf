"use client";

/**
 * 正式採用B（LED右端固定 7-6-6-6）のうち、
 * spine-preview-manga-1（ONE PIECE）だけ横幅を比較する。
 * 現状100%、D 85px、E 88px、A 130%、B 135%、C 140%。
 * 他の作品の座標とサイズは layoutLedRight のまま。本番ImageShelfは変更しない。
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

/** プレビューカタログ上の ONE PIECE。題名では判別しない */
const ONE_PIECE_ID = "spine-preview-manga-1";

const VARIANTS = [
  { id: "current", name: "現状", scale: 1 },
  { id: "d", name: "D案", width: 85 },
  { id: "e", name: "E案", width: 88 },
  { id: "a", name: "A案", scale: 1.3 },
  { id: "b", name: "B案", scale: 1.35 },
  { id: "c", name: "C案", scale: 1.4 },
] as const;

function targetWidth(
  box: PackedItem,
  variant: { scale?: number; width?: number }
) {
  if (variant.width != null) return variant.width;
  return box.width * (variant.scale ?? 1);
}

type NaturalSize = { width: number; height: number };

type OverlapHit = {
  bay: number;
  left: string;
  right: string;
  overlap: number;
};

function placeOne(box: PackedItem, width: number) {
  const centerX = box.x + box.width / 2;
  return {
    x: centerX - width / 2,
    y: box.y,
    width,
    height: box.height,
    centerX,
    bottom: box.y + box.height,
  };
}

function findOverlaps(
  placed: readonly PackedItem[],
  items: readonly MediaItem[],
  oneIndex: number,
  oneWidth: number
): OverlapHit[] {
  const hits: OverlapHit[] = [];
  for (const band of EVEN_BANDS) {
    const row = placed
      .filter((item) => item.bay === band.bay)
      .sort((a, b) => a.index - b.index);
    for (let slot = 1; slot < row.length; slot++) {
      const prevBox = row[slot - 1]!;
      const curBox = row[slot]!;
      const prev =
        prevBox.index === oneIndex
          ? placeOne(prevBox, oneWidth)
          : placeOne(prevBox, prevBox.width);
      const cur =
        curBox.index === oneIndex
          ? placeOne(curBox, oneWidth)
          : placeOne(curBox, curBox.width);
      const overlap = prev.x + prev.width - cur.x;
      if (overlap > 0.5) {
        hits.push({
          bay: band.bay,
          left: items[prevBox.index]?.title ?? "",
          right: items[curBox.index]?.title ?? "",
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
  stretch,
  nearLed,
  onOpen,
  onNatural,
}: {
  item: MediaItem;
  slotBox: { x: number; y: number; width: number; height: number };
  bay: number;
  stretch: boolean;
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
      data-item-id={item.id}
      data-width={slotBox.width.toFixed(2)}
      data-height={slotBox.height.toFixed(2)}
      data-bottom={(slotBox.y + slotBox.height).toFixed(2)}
      data-center={(slotBox.x + slotBox.width / 2).toFixed(2)}
      data-title={item.title}
      data-one-piece={stretch ? "1" : "0"}
    >
      {item.imageUrl ? (
        <>
          <span className={shelf.coverShadow} aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt=""
            className={stretch ? `${shelf.coverImg} ${local.stretchImg}` : shelf.coverImg}
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

type OnePieceWidthCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function OnePieceWidthCompare({ onOpen }: OnePieceWidthCompareProps) {
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
  const oneIndex = items.findIndex((item) => item.id === ONE_PIECE_ID);

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
  const oneBox =
    oneIndex >= 0 ? layout.placed.find((box) => box.index === oneIndex) ?? null : null;
  const anchor = layout.placed.filter((box) => box.bay === 1).at(-1) ?? null;
  const counts = [0, 1, 2, 3].map(
    (bay) => layout.placed.filter((item) => item.bay === bay).length
  );
  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;

  return (
    <div>
      <p className={styles.lead}>
        正式採用の「B：LED右端固定 7-6-6-6」と同じ25作品です。
        横幅を変えるのはプレビュー作品 spine-preview-manga-1（ONE PIECE）だけです。
        中心と下端は固定し、高さ110pxのまま左右へ広げます。他の24作品は現状の幅のままです。
      </p>
      <div className={styles.stats}>
        <div>
          画像サイズ確定: {known} / {withImage}。冊数 {counts.join("-")}（合計{" "}
          {layout.placed.length}）。2段目右端の中心{" "}
          {anchor ? (anchor.x + anchor.width / 2).toFixed(1) : "—"}px（LED{" "}
          {LED_LUMINOUS_CENTER_X}px）。
        </div>
        {oneBox ? (
          <div>
            ONE PIECE の表示幅:{" "}
            {VARIANTS.map((variant) => {
              const next = placeOne(oneBox, targetWidth(oneBox, variant));
              return `${variant.name} ${next.width.toFixed(1)}×${next.height.toFixed(1)}px`;
            }).join(" / ")}
          </div>
        ) : (
          <div className={styles.warn}>
            プレビュー内に spine-preview-manga-1 が見つかりません。
          </div>
        )}
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
          const shown = oneBox
            ? placeOne(oneBox, targetWidth(oneBox, variant))
            : null;
          const hits = shown
            ? findOverlaps(layout.placed, items, oneIndex, shown.width)
            : [];
          const percent =
            "scale" in variant && variant.scale != null && !("width" in variant)
              ? `（横${Math.round(variant.scale * 100)}%）`
              : "";
          const label = shown
            ? `${variant.name}：ONE PIECE ${shown.width.toFixed(1)}×${shown.height.toFixed(1)}px${percent}`
            : variant.name;
          return (
            <section key={variant.id}>
              <div
                className={styles.stageWrap}
                data-variant={variant.id}
                data-one-width={shown ? shown.width.toFixed(2) : ""}
              >
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
                    {layout.placed.map((box) => {
                      const item = items[box.index];
                      if (!item) return null;
                      const isOne = item.id === ONE_PIECE_ID;
                      const next = isOne
                        ? placeOne(box, targetWidth(box, variant))
                        : placeOne(box, box.width);
                      return (
                        <CoverFace
                          key={`${variant.id}-${box.index}-${item.id}`}
                          item={item}
                          slotBox={next}
                          bay={box.bay}
                          stretch={isOne}
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
