"use client";

/**
 * LEDを右へずらした比較。採用中の背景は表示するだけで書き換えない。
 * B/C/D は prototypes/led-shift の複製。2段目の6枠目だけ新しい発光中心に合わせる。
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
import { layoutLedRight } from "./ledRightLayout";
import styles from "./LedShiftCompare.module.css";

type NaturalSize = { width: number; height: number };

const STILE_X = 975;
const ZOOM_SCALE = 2;
const CROP_X = 560;
const CROP_Y = 148;

const VARIANTS = [
  {
    id: "A",
    label: "A：現行 x=811",
    center: 811,
    src: IMAGE_SHELF_BG.src,
    barLeft: 755,
    barRight: 866,
  },
  {
    id: "B",
    label: "B：右へ15px x=826",
    center: 826,
    src: "/images/prototypes/led-shift/shelf-dx15.png?v=led4",
    barLeft: 770,
    barRight: 882,
  },
  {
    id: "C",
    label: "C：右へ30px x=841",
    center: 841,
    src: "/images/prototypes/led-shift/shelf-dx30.png?v=led4",
    barLeft: 785,
    barRight: 896,
  },
  {
    id: "D",
    label: "D：右へ45px x=856",
    center: 856,
    src: "/images/prototypes/led-shift/shelf-dx45.png?v=led4",
    barLeft: 800,
    barRight: 911,
  },
] as const;

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
  label,
  src,
  center,
  showGuide,
  placed,
  items,
  sizes,
  onOpen,
  onNatural,
}: {
  label: string;
  src: string;
  center: number;
  showGuide: boolean;
  placed: PackedItem[];
  items: MediaItem[];
  sizes: VisualSize[];
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  return (
    <div>
      <p className={styles.cardLabel}>{label}</p>
      <div
        className={shelf.stage}
        style={{ aspectRatio: `${IMAGE_SHELF_BG.width} / ${IMAGE_SHELF_BG.height}` }}
      >
        <Image
          src={src}
          alt=""
          width={IMAGE_SHELF_BG.width}
          height={IMAGE_SHELF_BG.height}
          className={shelf.bg}
          unoptimized
        />
        {showGuide ? (
          <div
            className={styles.guide}
            style={{ left: `${(center / IMAGE_SHELF_BG.width) * 100}%` }}
          >
            <span className={styles.guideTag}>LED {center}</span>
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

type LedShiftCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function LedShiftCompare({ onOpen }: LedShiftCompareProps) {
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

  const layouts = useMemo(
    () => VARIANTS.map((variant) => layoutLedRight(sizes, variant.center)),
    [sizes]
  );
  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;

  return (
    <div>
      <p className={styles.lead}>
        7-6-6-6のまま、LEDの発光だけを右へずらした試作です。Aは採用中の背景そのもの。
        B・C・Dは別ファイルで、発光の芯を平行移動し、背板の光だまりは木目を残して光だけ動かしています。
        2段目の右端6枠目の表示中心を、それぞれの発光中心に合わせています。1・3・4段目の配置ルールは変えていません。
        本番には未反映です。
      </p>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={showGuide ? styles.toolBtnActive : styles.toolBtn}
          aria-pressed={showGuide}
          onClick={() => setShowGuide((value) => !value)}
        >
          LED中心の補助線 {showGuide ? "オン" : "オフ"}
        </button>
      </div>
      <p className={styles.stats}>
        画像サイズ確定: {known} / {withImage}。右側板の内面は x={STILE_X}。
        発光芯の右端からそこまでの空きを各案に記しています。
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

      <div className={styles.grid}>
        {VARIANTS.map((variant, index) => {
          const layout = layouts[index]!;
          return (
            <div key={variant.id}>
              <ShelfPane
                label={variant.label}
                src={variant.src}
                center={variant.center}
                showGuide={showGuide}
                placed={layout.placed}
                items={items}
                sizes={sizes}
                onOpen={onOpen}
                onNatural={onNatural}
              />
              <p className={styles.stats}>
                2段目の間隔 {layout.gap?.toFixed(1) ?? "—"}px。左余白{" "}
                {layout.leftMargin?.toFixed(1) ?? "—"}px。右余白{" "}
                {layout.rightMargin?.toFixed(1) ?? "—"}px。6枠目の中心差{" "}
                {layout.anchorDelta?.toFixed(1) ?? "—"}px。
                {!layout.fits ? <span className={styles.warn}> {layout.reason}</span> : null}
              </p>
            </div>
          );
        })}
      </div>

      <h2 className={styles.sectionTitle}>LED周辺の拡大（消した木目・移動後の光・右側板）</h2>
      {VARIANTS.map((variant) => {
        const midpoint = (variant.barLeft + variant.barRight) / 2;
        return (
          <div key={`zoom-${variant.id}`}>
            <p className={styles.cardLabel}>
              {variant.label}　発光芯 {variant.barLeft}–{variant.barRight}（中点{" "}
              {midpoint.toFixed(1)}）　右側板まで {STILE_X - variant.barRight}px
            </p>
            <div className={styles.zoomPort}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={variant.src}
                alt=""
                className={styles.zoomImg}
                style={{
                  width: IMAGE_SHELF_BG.width * ZOOM_SCALE,
                  left: -CROP_X * ZOOM_SCALE,
                  top: -CROP_Y * ZOOM_SCALE,
                }}
              />
              {showGuide ? (
                <div
                  className={styles.guide}
                  style={{ left: (variant.center - CROP_X) * ZOOM_SCALE }}
                >
                  <span className={styles.guideTag}>LED {variant.center}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      <h2 className={styles.sectionTitle}>2段目の配置</h2>
      {VARIANTS.map((variant, index) => (
        <div key={`table-${variant.id}`} className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{variant.label}</th>
                <th>中心X</th>
                <th>LEDとの差</th>
                <th>右隣との隙間</th>
              </tr>
            </thead>
            <tbody>
              {layouts[index]!.rows.map((row) => (
                <tr key={`${variant.id}-${row.slot}`}>
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
      ))}

      <p className={styles.meta}>
        数値は1024px座標。右側板の内面は発光芯の行で輝度が立ち上がる x={STILE_X}。
        空棚素材にもLEDは焼き込まれていて、LEDなしの元写真はありません。光の芯は未点灯の溝の色を残して移動し、
        背板は同じ行の木の色に対する光だけをずらしています。塗りつぶしや木目のコピーはしていません。
      </p>
    </div>
  );
}
