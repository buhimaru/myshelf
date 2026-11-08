"use client";

/**
 * 現行の均等配置B（7-7-6-6）と、2段目右端をLED直下に固定した7-6-6-6の比較。
 * 本番未適用。均等配置Bの計算は変更しない。
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
import { LED_LUMINOUS_CENTER_X } from "./ledAnchorLayout";
import {
  type LedRightRow,
  layoutLedRight,
} from "./ledRightLayout";
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

function GapTable({ title, rows }: { title: string; rows: LedRightRow[] }) {
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
                {row.slot + 1}枠目{row.anchored ? "（LED直下）" : ""}
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
            data-led-guide=""
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

type LedRightCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function LedRightCompare({ onOpen }: LedRightCompareProps) {
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
  const currentRows = useMemo(() => {
    const bay = currentLayout.placed.filter((item) => item.bay === 1);
    return bay.map((item, slot) => {
      const center = item.x + item.width / 2;
      const next = bay[slot + 1];
      return {
        slot,
        center,
        delta: center - LED_LUMINOUS_CENTER_X,
        gapToNext: next ? next.x - (item.x + item.width) : null,
        anchored: false,
      };
    });
  }, [currentLayout.placed]);
  const nextLayout = useMemo(() => layoutLedRight(sizes), [sizes]);
  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;
  const counts = [0, 1, 2, 3].map(
    (bay) => nextLayout.placed.filter((item) => item.bay === bay).length
  );

  return (
    <div>
      <p className={styles.lead}>
        左が現在の均等配置B（7-7-6-6、26冊）。右は2段目を6冊にし、右端の6枠目の
        表示中心をLED発光中心 {LED_LUMINOUS_CENTER_X}px に固定した試作です。
        1・3・4段の均等ルール、高さ110px、縦横比、下端の接地はそのままです。正式採用前です。
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
          画像サイズ確定: {known} / {withImage}。Bの冊数{" "}
          {counts.join("-")}（合計 {nextLayout.placed.length}）。LED中心{" "}
          {LED_LUMINOUS_CENTER_X}px。
        </div>
        {nextLayout.fits ? (
          <div>
            2段目を適用済み。6枠目の中心 {nextLayout.anchorCenter?.toFixed(1)}px、
            LEDとの差 {nextLayout.anchorDelta?.toFixed(1)}px。作品間隔{" "}
            {nextLayout.gap?.toFixed(1)}px。左余白{" "}
            {nextLayout.leftMargin?.toFixed(1)}px。右余白{" "}
            {nextLayout.rightMargin?.toFixed(1)}px。
          </div>
        ) : (
          <div className={styles.warn}>{nextLayout.reason}</div>
        )}
        {nextLayout.warning ? (
          <div className={styles.warn}>{nextLayout.warning}</div>
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
          label="A：現在の均等配置B案（7-7-6-6）"
          placed={currentLayout.placed}
          items={items}
          sizes={sizes}
          showGuide={showGuide}
          onOpen={onOpen}
          onNatural={onNatural}
        />
        <ShelfPane
          label="B：LED右端固定（7-6-6-6）"
          placed={nextLayout.placed}
          items={items}
          sizes={sizes}
          showGuide={showGuide}
          onOpen={onOpen}
          onNatural={onNatural}
        />
      </div>

      <GapTable title="A 2段目（7枠・現行B）" rows={currentRows} />
      <GapTable
        title={nextLayout.fits ? "B 2段目（6枠・LED直下）" : "B 2段目（未適用）"}
        rows={nextLayout.rows}
      />

      <p className={styles.meta}>
        数値は1024px座標。差は作品の表示中心 − LED中心。左余白は使用可能帯の左端から1枠目まで、
        右余白は6枠目の右端から使用可能帯の右端までです。
      </p>
    </div>
  );
}
