"use client";

/**
 * 現行の均等配置Bと、2段目LED直下アンカーの比較。
 * 均等配置Bの計算は変更しない。本番未適用。
 */

import Image from "next/image";
import { useMemo, useState, type SyntheticEvent } from "react";
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
  EVEN_COUNTS,
  type PackedItem,
  type VisualSize,
  aVisualSize,
  layoutEven,
  packToPercent,
} from "./intrinsicPackLayout";
import {
  LED_LUMINOUS_CENTER_X,
  type LedGapRow,
  evenRowsForBay1,
  layoutLedAnchor,
} from "./ledAnchorLayout";
import styles from "./LedAnchorCompare.module.css";

type NaturalSize = { width: number; height: number };

function CoverFace({
  item,
  visual,
  slotBox,
  nearLed,
  onOpen,
  onNatural,
}: {
  item: MediaItem;
  visual: VisualSize;
  slotBox: { x: number; y: number; width: number; height: number };
  nearLed: boolean;
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  const pct = packToPercent(slotBox);
  const genre = SHELF_TYPE_LABEL[item.type] ?? "作品";
  const fitted =
    slotBox.width !== visual.width || slotBox.height !== visual.height;
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
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
    >
      {item.imageUrl ? (
        fitted ? (
          <span className={shelf.coverFitWrap}>
            <span
              className={shelf.coverFitInner}
              style={{
                width: `${(visual.width / slotBox.width) * 100}%`,
                height: `${(visual.height / slotBox.height) * 100}%`,
              }}
            >
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
            </span>
          </span>
        ) : (
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
        )
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

function GapTable({ title, rows }: { title: string; rows: LedGapRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{title}</th>
            <th>中心X</th>
            <th>LEDとの差</th>
            <th>右隣との隙間</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${title}-${row.slot}`}>
              <td>
                {row.slot + 1}枠目{row.anchored ? "（直下候補）" : ""}
              </td>
              <td>{row.center.toFixed(1)}</td>
              <td>{row.delta.toFixed(1)}px</td>
              <td>{row.gapToNext == null ? "—" : `${row.gapToNext.toFixed(1)}px`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShelfPane({
  label,
  placed,
  items,
  sizes,
  showGuide,
  onOpen,
  onNatural,
}: {
  label: string;
  placed: PackedItem[];
  items: MediaItem[];
  sizes: VisualSize[];
  showGuide: boolean;
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  return (
    <div className={styles.stageWrap}>
      <p className={styles.stageLabel}>{label}</p>
      <div
        className={shelf.stage}
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
          priority
          unoptimized
        />
        {showGuide ? (
          <div
            className={styles.guide}
            style={{ left: `${(LED_LUMINOUS_CENTER_X / IMAGE_SHELF_BG.width) * 100}%` }}
          >
            <span className={styles.guideTag}>LED {LED_LUMINOUS_CENTER_X}</span>
          </div>
        ) : null}
        <div className={shelf.coverLayer}>
          {placed.map((box) => {
            const item = items[box.index];
            const visual = sizes[box.index];
            if (!item || !visual) return null;
            return (
              <CoverFace
                key={`${label}-${box.index}-${item.id}`}
                item={item}
                visual={visual}
                slotBox={{
                  x: box.x,
                  y: box.y,
                  width: visual.width,
                  height: visual.height,
                }}
                nearLed={isNearImageShelfLed({
                  x: box.x,
                  width: visual.width,
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

type LedAnchorCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function LedAnchorCompare({ onOpen }: LedAnchorCompareProps) {
  const [showGuide, setShowGuide] = useState(true);
  const [naturals, setNaturals] = useState<Record<string, NaturalSize>>({});
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

  const currentLayout = useMemo(
    () => layoutEven(sizes, EVEN_COUNTS.B),
    [sizes]
  );
  const current = useMemo(() => evenRowsForBay1(sizes), [sizes]);
  const anchored = useMemo(() => layoutLedAnchor(sizes), [sizes]);
  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;

  return (
    <div>
      <p className={styles.lead}>
        左が現在の均等配置B（7-7-6-6）。右は2段目だけ、LED発光中心
        {LED_LUMINOUS_CENTER_X}px に最も近い配置枠の表示中心を合わせた試作です。
        作品の高さと縦横比、他の段、固定装飾は変えていません。正式採用前です。
      </p>
      <div className={styles.toolbar}>
        <div className={styles.btnGroup}>
          <button
            type="button"
            className={showGuide ? styles.toolBtnActive : styles.toolBtn}
            aria-pressed={showGuide}
            onClick={() => setShowGuide((value) => !value)}
          >
            LED中心の補助線 {showGuide ? "オン" : "オフ"}
          </button>
        </div>
      </div>
      <div className={styles.stats}>
        <div>
          画像サイズ確定: {known} / {withImage}。LED中心 {LED_LUMINOUS_CENTER_X}px
          （発光部の左右端の中点）。アンカー枠は {anchored.anchorSlot + 1} 枠目。
        </div>
        {anchored.fits ? (
          <div>
            適用済み。左側の隙間 {anchored.leftGap?.toFixed(1) ?? "—"}px / 右側の隙間{" "}
            {anchored.rightGap?.toFixed(1) ?? "—"}px。直下枠の中心差は 0
            になるよう配置しています。
          </div>
        ) : (
          <div className={styles.warn}>{anchored.reason}</div>
        )}
        {anchored.gapWarning ? (
          <div className={styles.warn}>{anchored.gapWarning}</div>
        ) : null}
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

      <div className={styles.compareGrid}>
        <ShelfPane
          label="A：現在の均等配置B案"
          placed={currentLayout.placed}
          items={items}
          sizes={sizes}
          showGuide={showGuide}
          onOpen={onOpen}
          onNatural={onNatural}
        />
        <ShelfPane
          label="B：LED直下アンカー付き"
          placed={anchored.placed}
          items={items}
          sizes={sizes}
          showGuide={showGuide}
          onOpen={onOpen}
          onNatural={onNatural}
        />
      </div>

      <GapTable title="A 2段目（表示中）" rows={current} />
      <GapTable
        title={anchored.fits ? "B 2段目（表示中）" : "B 2段目（表示はAのまま）"}
        rows={anchored.rows}
      />
      {anchored.proposal ? (
        <GapTable title="B アンカー試算（未適用）" rows={anchored.proposal} />
      ) : null}

      <p className={styles.meta}>
        数値は1024px座標。差は作品の表示中心 − LED中心。負の値はライトより左です。
      </p>
    </div>
  );
}
