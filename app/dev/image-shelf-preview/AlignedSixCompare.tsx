"use client";

/**
 * A: LED直下固定 7-6-6-6（25冊）
 * B: 1段目も6冊にし、2段目の表示中心へ合わせた 6-6-6-6（24冊）
 * 背景・LEDは正式採用版のまま。本番未適用。
 */

import Image from "next/image";
import { useMemo, useState, type SyntheticEvent } from "react";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import { IMAGE_SHELF_BG } from "../../../utils/imageShelfLayout";
import { COVER_SHELF_RICH_ITEMS } from "../cover-shelf-preview/items";
import shelf from "./IntrinsicPackCompare.module.css";
import {
  A_SLOT_SIZE,
  type PackedItem,
  type VisualSize,
  aVisualSize,
  packToPercent,
} from "./intrinsicPackLayout";
import { LED_LUMINOUS_CENTER_X } from "./ledAnchorLayout";
import { layoutLedRight } from "./ledRightLayout";
import { type SlotEdge, layoutAlignedSix } from "./alignedSixLayout";
import styles from "./LedAnchorCompare.module.css";

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

function edgesOf(items: PackedItem[]): SlotEdge[] {
  return items.map((item, slot) => {
    const next = items[slot + 1];
    const center = item.x + item.width / 2;
    return {
      slot,
      left: item.x,
      center,
      right: item.x + item.width,
      width: item.width,
      gapToNext: next ? next.x - (item.x + item.width) : null,
      ledDelta: center - LED_LUMINOUS_CENTER_X,
    };
  });
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

function EdgeTable({ title, rows }: { title: string; rows: SlotEdge[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{title}</th>
            <th>左端</th>
            <th>中心</th>
            <th>右端</th>
            <th>LEDとの差</th>
            <th>右隣との隙間</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${title}-${row.slot}`}>
              <td>{row.slot + 1}枠目</td>
              <td>{row.left.toFixed(1)}</td>
              <td>{row.center.toFixed(1)}</td>
              <td>{row.right.toFixed(1)}</td>
              <td>{row.ledDelta.toFixed(1)}px</td>
              <td>{row.gapToNext == null ? "—" : `${row.gapToNext.toFixed(1)}px`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type AlignedSixCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function AlignedSixCompare({ onOpen }: AlignedSixCompareProps) {
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

  const planA = useMemo(() => layoutLedRight(sizes), [sizes]);
  const planB = useMemo(() => layoutAlignedSix(sizes), [sizes]);
  const aBay0 = useMemo(
    () => edgesOf(planA.placed.filter((item) => item.bay === 0)),
    [planA.placed]
  );
  const aBay1 = useMemo(
    () => edgesOf(planA.placed.filter((item) => item.bay === 1)),
    [planA.placed]
  );
  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;
  const bCounts = [0, 1, 2, 3].map(
    (bay) => planB.placed.filter((item) => item.bay === bay).length
  );
  const first = planB.bay0[0];
  const last = planB.bay0[5];
  const belowFirst = planB.bay1[0];
  const belowLast = planB.bay1[5];

  return (
    <div>
      <p className={styles.lead}>
        左がLED直下固定の7-6-6-6（25冊）。右は1段目も6冊にした6-6-6-6（24冊）です。
        1段目と2段目は同じルールです。右端6冊目の表示中心をLED {LED_LUMINOUS_CENTER_X}px に固定し、
        左の5冊は左余白が間隔の半分になるよう均等に並べます。幅が違うので輪郭は縦一列になりません。
        背景とLEDは正式採用版のままです。
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
          画像サイズ確定: {known} / {withImage}。Bの冊数 {bCounts.join("-")}（合計{" "}
          {planB.placed.length}）。
        </div>
        {planB.fits && planB.sharedCenters && first && last && belowFirst && belowLast ? (
          <div>
            Bの1段目と2段目。左端の差 {(first.left - belowFirst.left).toFixed(1)}px。
            右端の差 {(last.right - belowLast.right).toFixed(1)}px。
            6枠目の中心は両方 {last.center.toFixed(1)} / {belowLast.center.toFixed(1)}
            （LEDとの差 {last.ledDelta.toFixed(1)} / {belowLast.ledDelta.toFixed(1)}px）。
          </div>
        ) : (
          <div className={styles.warn}>{planB.reason}</div>
        )}
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
                onNatural(item.id, { width: img.naturalWidth, height: img.naturalHeight });
              }}
            />
          ) : null
        )}
      </div>

      <div className={styles.compareGrid}>
        <ShelfPane
          label="A：LED直下固定 7-6-6-6（25冊）"
          placed={planA.placed}
          items={items}
          sizes={sizes}
          showGuide={showGuide}
          onOpen={onOpen}
          onNatural={onNatural}
        />
        <ShelfPane
          label="B：同じルール 6-6-6-6（24冊）"
          placed={planB.placed}
          items={items}
          sizes={sizes}
          showGuide={showGuide}
          onOpen={onOpen}
          onNatural={onNatural}
        />
      </div>

      <EdgeTable title="A 1段目（7枠）" rows={aBay0} />
      <EdgeTable title="A 2段目（6枠・LED直下）" rows={aBay1} />
      <EdgeTable title="B 1段目（6枠・同じルール）" rows={planB.bay0} />
      <EdgeTable title="B 2段目（6枠・LED直下）" rows={planB.bay1} />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>B 同じ枠の比較</th>
              <th>1段目の左端</th>
              <th>2段目の左端</th>
              <th>左端の差</th>
              <th>1段目の右端</th>
              <th>2段目の右端</th>
              <th>右端の差</th>
              <th>1段目の隙間</th>
              <th>2段目の隙間</th>
            </tr>
          </thead>
          <tbody>
            {planB.bay0.map((row, index) => {
              const below = planB.bay1[index];
              if (!below) return null;
              return (
                <tr key={`pair-${row.slot}`}>
                  <td>{row.slot + 1}枠目</td>
                  <td>{row.left.toFixed(1)}</td>
                  <td>{below.left.toFixed(1)}</td>
                  <td>{(row.left - below.left).toFixed(1)}px</td>
                  <td>{row.right.toFixed(1)}</td>
                  <td>{below.right.toFixed(1)}</td>
                  <td>{(row.right - below.right).toFixed(1)}px</td>
                  <td>{row.gapToNext == null ? "—" : `${row.gapToNext.toFixed(1)}px`}</td>
                  <td>{below.gapToNext == null ? "—" : `${below.gapToNext.toFixed(1)}px`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={styles.meta}>
        数値は1024px座標。差は1段目 − 2段目。LEDとの差は表示中心 − {LED_LUMINOUS_CENTER_X}。
        3段目と4段目は従来の均等配置で、1段目が1冊減った分だけ作品が順に繰り上がります。
      </p>
    </div>
  );
}
