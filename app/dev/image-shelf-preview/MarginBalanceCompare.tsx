"use client";

/**
 * 6-6-6-6 の左右余白を3案で比較する。
 * A は LED 完全一致。B/C は段ごとの水平移動だけ。本番未適用。
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
import { LED_LUMINOUS_CENTER_X } from "./ledAnchorLayout";
import {
  LED_DRIFT_LIMIT,
  type MarginPlan,
  layoutMarginPlans,
} from "./marginBalanceLayout";
import styles from "./LedAnchorCompare.module.css";
import grid from "./MarginBalanceCompare.module.css";

type NaturalSize = { width: number; height: number };

function CoverFace({
  item,
  visual,
  slotBox,
  onOpen,
  onNatural,
}: {
  item: MediaItem;
  visual: VisualSize;
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
  plan,
  items,
  sizes,
  showGuide,
  onOpen,
  onNatural,
}: {
  plan: MarginPlan;
  items: MediaItem[];
  sizes: VisualSize[];
  showGuide: boolean;
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  return (
    <div className={styles.stageWrap}>
      <p className={styles.stageLabel}>{plan.label}</p>
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
        {showGuide ? (
          <div
            className={styles.guide}
            style={{ left: `${(LED_LUMINOUS_CENTER_X / IMAGE_SHELF_BG.width) * 100}%` }}
          >
            <span className={styles.guideTag}>LED {LED_LUMINOUS_CENTER_X}</span>
          </div>
        ) : null}
        <div className={shelf.coverLayer}>
          {plan.placed.map((box) => {
            const item = items[box.index];
            const visual = sizes[box.index];
            if (!item || !visual) return null;
            return (
              <CoverFace
                key={`${plan.id}-${box.index}-${item.id}`}
                item={item}
                visual={visual}
                slotBox={{
                  x: box.x,
                  y: box.y,
                  width: visual.width,
                  height: visual.height,
                }}
                onOpen={onOpen}
                onNatural={onNatural}
              />
            );
          })}
        </div>
      </div>
      {plan.reason ? <p className={styles.warn}>{plan.reason}</p> : null}
    </div>
  );
}

type MarginBalanceCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function MarginBalanceCompare({ onOpen }: MarginBalanceCompareProps) {
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const previousHeight = root.style.height;
    // ルートの h-full が html をビューポート高に固定し、長い比較が枠の外で止まる。
    root.style.height = "auto";
    return () => {
      root.style.height = previousHeight;
    };
  }, []);
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

  const plans = useMemo(() => layoutMarginPlans(sizes), [sizes]);
  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;
  const band = EVEN_BANDS[0];

  return (
    <div>
      <p className={styles.lead}>
        6-6-6-6の1段目と2段目だけを比べています。Aは右端の表示中心をLED {LED_LUMINOUS_CENTER_X}
        px に固定した現行案。Bは各段の作品群を水平に動かし、ジャケット外形の左右余白を同じにします。
        Cはその移動を、6枠目の中心がLEDから {LED_DRIFT_LIMIT}px を超えない範囲に収めた折衷です。
        間隔・幅・高さ・3段目・4段目・背景は変えていません。
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
      <p className={styles.stats}>
        画像サイズ確定: {known} / {withImage}。左右余白は使用可能帯 {band.left}–{band.right}
        と、表示されているジャケット外形の間です。
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
                onNatural(item.id, { width: img.naturalWidth, height: img.naturalHeight });
              }}
            />
          ) : null
        )}
      </div>

      <div className={grid.grid}>
        {plans.map((plan) => (
          <ShelfPane
            key={plan.id}
            plan={plan}
            items={items}
            sizes={sizes}
            showGuide={showGuide}
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
              <th>左余白</th>
              <th>右余白</th>
              <th>左右差</th>
              <th>6枠目の中心</th>
              <th>LEDとの差</th>
              <th>作品間隔</th>
              <th>水平移動</th>
            </tr>
          </thead>
          <tbody>
            {plans.flatMap((plan) =>
              plan.bays.map((row) => (
                <tr key={`${plan.id}-${row.bay}`}>
                  <td>{plan.id}</td>
                  <td>{row.bay + 1}段目</td>
                  <td>{row.leftMargin.toFixed(1)}px</td>
                  <td>{row.rightMargin.toFixed(1)}px</td>
                  <td>{row.marginDiff.toFixed(1)}px</td>
                  <td>{row.anchorCenter.toFixed(1)}</td>
                  <td>{row.ledDelta.toFixed(1)}px</td>
                  <td>{row.gap.toFixed(1)}px</td>
                  <td>{row.shift.toFixed(1)}px</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className={styles.meta}>
        左右差は右余白 − 左余白。LEDとの差は6枠目の表示中心 − {LED_LUMINOUS_CENTER_X}。
        水平移動はAから右への移動量です。正式採用前です。
      </p>
    </div>
  );
}
