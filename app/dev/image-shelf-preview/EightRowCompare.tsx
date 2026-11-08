"use client";

/**
 * A: 現行の 6-6-6-6（1・2段はLED直下固定）
 * B: 1・2段を8冊の実表示幅で均等配置。LEDは使わない。
 * 高さ110・縦横比・接地・背景は維持。本番未適用。
 */

import Image from "next/image";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import { IMAGE_SHELF_BG } from "../../../utils/imageShelfLayout";
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
import { ALIGNED_COUNTS, layoutAlignedSix } from "./alignedSixLayout";
import {
  EIGHT_COUNTS,
  type RowReport,
  describeRows,
  layoutEightRows,
} from "./eightRowLayout";
import styles from "./LedAnchorCompare.module.css";
import grid from "./EightRowCompare.module.css";

type NaturalSize = { width: number; height: number };

function CoverFace({
  item,
  slotBox,
  onOpen,
  onNatural,
}: {
  item: MediaItem;
  slotBox: { x: number; y: number; width: number; height: number };
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  const pct = packToPercent(slotBox);
  const genre = SHELF_TYPE_LABEL[item.type] ?? "作品";
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      onNatural(item.id, { width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  return (
    <button
      type="button"
      className={`${shelf.coverBtn}${item.imageUrl ? "" : ` ${shelf.coverBtnText}`}`}
      style={{ left: pct.left, top: pct.top, width: pct.width, height: pct.height }}
      onClick={() => onOpen(item)}
      aria-label={`${item.title}の詳細を開く`}
    >
      {item.imageUrl ? (
        <>
          <span className={shelf.coverShadow} aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt=""
            className={shelf.coverImg}
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
  placed,
  items,
  note,
  onOpen,
  onNatural,
}: {
  label: string;
  placed: PackedItem[];
  items: MediaItem[];
  note: string | null;
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  return (
    <div className={styles.stageWrap}>
      <p className={styles.stageLabel}>{label}</p>
      <div
        className={`${shelf.stage} ${grid.stage}`}
        style={{ aspectRatio: `${IMAGE_SHELF_BG.width} / ${IMAGE_SHELF_BG.height}` }}
      >
        <Image
          src={IMAGE_SHELF_BG.src}
          alt=""
          width={IMAGE_SHELF_BG.width}
          height={IMAGE_SHELF_BG.height}
          className={shelf.bg}
          unoptimized
        />
        <div className={shelf.coverLayer}>
          {placed.map((box) => {
            const item = items[box.index];
            if (!item) return null;
            return (
              <CoverFace
                key={`${label}-${box.index}-${item.id}`}
                item={item}
                slotBox={{
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height,
                }}
                onOpen={onOpen}
                onNatural={onNatural}
              />
            );
          })}
        </div>
      </div>
      {note ? <p className={styles.warn}>{note}</p> : null}
    </div>
  );
}

function px(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}px`;
}

function gapText(row: RowReport): string {
  if (row.gap == null) return "—";
  if (
    row.gapMin != null &&
    row.gapMax != null &&
    Math.abs(row.gapMax - row.gapMin) > 0.2
  ) {
    return `${row.gapMin.toFixed(1)}–${row.gapMax.toFixed(1)}px`;
  }
  return `${row.gap.toFixed(1)}px`;
}

type EightRowCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function EightRowCompare({ onOpen }: EightRowCompareProps) {
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
      items.map((item) => {
        if (!item.imageUrl) return { width: A_SLOT_SIZE, height: A_SLOT_SIZE };
        const natural = naturals[item.id];
        if (!natural) return { width: A_SLOT_SIZE, height: A_SLOT_SIZE };
        return aVisualSize(natural.width, natural.height);
      }),
    [items, naturals]
  );

  const aligned = useMemo(() => layoutAlignedSix(sizes), [sizes]);
  const eight = useMemo(() => layoutEightRows(sizes), [sizes]);
  const rowsA = useMemo(
    () => describeRows(aligned.placed, sizes, ALIGNED_COUNTS),
    [aligned.placed, sizes]
  );
  const rowsB = useMemo(
    () => describeRows(eight.placed, sizes, EIGHT_COUNTS, eight.metrics),
    [eight.placed, eight.metrics, sizes]
  );

  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;
  const band = EVEN_BANDS[0];
  const plans = [
    {
      id: "A",
      label: "A：6-6-6-6（LED直下固定）",
      placed: aligned.placed,
      rows: rowsA,
      note: aligned.reason,
    },
    {
      id: "B",
      label: "B：8-8-6-6（高さ維持・LED不使用）",
      placed: eight.placed,
      rows: rowsB,
      note: rowsB
        .filter((row) => row.reason)
        .map((row) => `${row.bay + 1}段目: ${row.reason}`)
        .join(" "),
    },
  ];

  return (
    <div>
      <p className={styles.lead}>
        1段目・2段目を8作品にした場合です。表示高さ110pxとcontain
        100%の実表示幅はそのままです。BはLEDの位置を使わず、使用可能帯{" "}
        {band.left}–{band.right} の中でジャケット外形の左右余白と作品間隔を均等にします。
        幅が足りない段は縮小せず、置かずに必要幅と不足幅を出します。3段目・4段目は現行の均等6作品です。順番と背景は同じです。
      </p>
      <p className={styles.stats}>
        画像サイズ確定: {known} / {withImage}。1・2段の使用可能幅は {band.right - band.left}
        px。正式採用前です。
      </p>

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

      <div className={grid.grid}>
        {plans.map((plan) => (
          <ShelfPane
            key={plan.id}
            label={plan.label}
            placed={plan.placed}
            items={items}
            note={plan.note || null}
            onOpen={onOpen}
            onNatural={onNatural}
          />
        ))}
      </div>

      <div className={`${styles.tableWrap} ${grid.tableWrap}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>案</th>
              <th>段</th>
              <th>冊数</th>
              <th>左余白</th>
              <th>右余白</th>
              <th>作品間隔</th>
              <th>実表示幅</th>
              <th>幅合計</th>
              <th>使用可能幅</th>
              <th>不足</th>
              <th>重なり</th>
            </tr>
          </thead>
          <tbody>
            {plans.flatMap((plan) =>
              plan.rows.map((row) => (
                <tr key={`${plan.id}-${row.bay}`}>
                  <td>{plan.id}</td>
                  <td>{row.bay + 1}段目</td>
                  <td>
                    {row.placedCount}/{row.count}
                  </td>
                  <td>{px(row.leftMargin)}</td>
                  <td>{px(row.rightMargin)}</td>
                  <td>{gapText(row)}</td>
                  <td>{row.widths.map((width) => width.toFixed(1)).join(", ")}</td>
                  <td>{row.widthSum.toFixed(1)}px</td>
                  <td>{row.usable}px</td>
                  <td>{row.shortage.toFixed(1)}px</td>
                  <td>{row.overlap ? "あり" : "なし"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className={styles.meta}>
        左右余白と作品間隔は、配置枠ではなく表示されているジャケット外形の間です。不足は実表示幅の合計から使用可能幅を引いた値です。重なりは外形が交差する場合だけ「あり」です。
      </p>
    </div>
  );
}
