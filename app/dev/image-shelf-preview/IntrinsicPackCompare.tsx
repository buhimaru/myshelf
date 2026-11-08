"use client";

/**
 * 実表示幅の均等配置比較（プレビュー専用）。
 * 高さは現行A案の contain 実表示高を維持する。本番配置は未変更。
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
import styles from "./IntrinsicPackCompare.module.css";
import {
  A_FIVE_XS,
  A_SIT_Y,
  A_SLOT_SIZE,
  EVEN_COUNTS,
  EVEN_LABELS,
  type BayEvenMetrics,
  type EvenPresetId,
  type PackedItem,
  type VisualSize,
  aVisualSize,
  layoutEven,
  packToPercent,
  validateEven,
} from "./intrinsicPackLayout";

type ViewState =
  | { kind: "single"; id: EvenPresetId }
  | { kind: "pair"; left: EvenPresetId; right: EvenPresetId };

type NaturalSize = { width: number; height: number };

function sourceItems(): MediaItem[] {
  return COVER_SHELF_RICH_ITEMS.map((item) => ({ ...item }));
}

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
      className={`${styles.coverBtn}${item.imageUrl ? "" : ` ${styles.coverBtnText}`}${nearLed ? ` ${styles.coverNearLed}` : ""}`}
      style={{
        left: pct.left,
        top: pct.top,
        width: pct.width,
        height: pct.height,
      }}
      onClick={() => onOpen(item)}
      aria-label={`${item.title}の詳細を開く`}
      data-visual-w={visual.width.toFixed(1)}
      data-visual-h={visual.height.toFixed(1)}
    >
      {item.imageUrl ? (
        fitted ? (
          <span className={styles.coverFitWrap}>
            <span
              className={styles.coverFitInner}
              style={{
                width: `${(visual.width / slotBox.width) * 100}%`,
                height: `${(visual.height / slotBox.height) * 100}%`,
              }}
            >
              <span className={styles.coverShadow} aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt=""
                className={styles.coverImg}
                draggable={false}
                onLoad={onLoad}
              />
              <span className={styles.coverLight} aria-hidden />
            </span>
          </span>
        ) : (
          <>
            <span className={styles.coverShadow} aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt=""
              className={styles.coverImg}
              draggable={false}
              onLoad={onLoad}
            />
            <span className={styles.coverLight} aria-hidden />
          </>
        )
      ) : (
        <>
          <span className={styles.coverShadow} aria-hidden />
          <span className={styles.coverFallback}>
            <span className={styles.coverFallbackLabel}>NO IMAGE</span>
            <span className={styles.coverFallbackTitle}>{item.title}</span>
            <span className={styles.coverFallbackGenre}>{genre}</span>
          </span>
          <span className={styles.coverLight} aria-hidden />
        </>
      )}
    </button>
  );
}

function sizesFor(
  items: MediaItem[],
  naturals: Record<string, NaturalSize>
): VisualSize[] {
  return items.map((item) => {
    if (!item.imageUrl) return { width: A_SLOT_SIZE, height: A_SLOT_SIZE };
    const natural = naturals[item.id];
    if (!natural) return { width: A_SLOT_SIZE, height: A_SLOT_SIZE };
    return aVisualSize(natural.width, natural.height);
  });
}

function aPlaced(itemCount: number): PackedItem[] {
  const placed: PackedItem[] = [];
  let index = 0;
  for (let bay = 0; bay < 4; bay++) {
    for (const x of A_FIVE_XS[bay]!) {
      if (index >= itemCount) return placed;
      placed.push({
        index,
        bay,
        x,
        y: A_SIT_Y[bay]! - A_SLOT_SIZE,
        width: A_SLOT_SIZE,
        height: A_SLOT_SIZE,
        sitY: A_SIT_Y[bay]!,
      });
      index += 1;
    }
  }
  return placed;
}

function PackStage({
  id,
  items,
  sizes,
  onOpen,
  onNatural,
}: {
  id: EvenPresetId;
  items: MediaItem[];
  sizes: VisualSize[];
  onOpen: (item: MediaItem) => void;
  onNatural: (id: string, size: NaturalSize) => void;
}) {
  const boxes = useMemo(() => {
    if (id === "A") {
      return {
        placed: aPlaced(items.length),
        metrics: [] as BayEvenMetrics[],
        overflow: Math.max(0, items.length - 20),
      };
    }
    return layoutEven(sizes, EVEN_COUNTS[id]);
  }, [id, items.length, sizes]);

  const shown = id === "A" ? Math.min(20, boxes.placed.length) : boxes.placed.length;

  return (
    <div className={styles.stageWrap}>
      <p className={styles.stageLabel}>
        {EVEN_LABELS[id]}（表示 {shown}
        {boxes.overflow > 0 ? ` / 次ページ以降 ${boxes.overflow}` : ""}）
      </p>
      <div
        className={styles.stage}
        style={{
          aspectRatio: `${IMAGE_SHELF_BG.width} / ${IMAGE_SHELF_BG.height}`,
        }}
        data-pack={id}
      >
        <Image
          src={IMAGE_SHELF_BG.src}
          alt=""
          width={IMAGE_SHELF_BG.width}
          height={IMAGE_SHELF_BG.height}
          className={styles.bg}
          priority
          unoptimized
        />
        <div className={styles.coverLayer}>
          {boxes.placed.map((box) => {
            const item = items[box.index];
            const visual = sizes[box.index];
            if (!item || !visual) return null;
            return (
              <CoverFace
                key={`${id}-${item.id}-${box.index}`}
                item={item}
                visual={visual}
                slotBox={
                  id === "A"
                    ? box
                    : {
                        x: box.x,
                        y: box.y,
                        width: visual.width,
                        height: visual.height,
                      }
                }
                nearLed={isNearImageShelfLed({
                  x: box.x,
                  width: id === "A" ? A_SLOT_SIZE : visual.width,
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

type IntrinsicPackCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function IntrinsicPackCompare({
  onOpen,
}: IntrinsicPackCompareProps) {
  const [view, setView] = useState<ViewState>({
    kind: "pair",
    left: "A",
    right: "B",
  });
  const [naturals, setNaturals] = useState<Record<string, NaturalSize>>({});
  const items = useMemo(() => sourceItems(), []);

  const onNatural = (id: string, size: NaturalSize) => {
    setNaturals((prev) => {
      const cur = prev[id];
      if (cur && cur.width === size.width && cur.height === size.height) {
        return prev;
      }
      return { ...prev, [id]: size };
    });
  };

  const sizes = useMemo(() => sizesFor(items, naturals), [items, naturals]);
  const visibleIds: EvenPresetId[] =
    view.kind === "single" ? [view.id] : [view.left, view.right];
  const evenPacks = useMemo(
    () =>
      visibleIds
        .filter((id): id is Exclude<EvenPresetId, "A"> => id !== "A")
        .map((id) => ({ id, pack: layoutEven(sizes, EVEN_COUNTS[id]) })),
    [sizes, view]
  );
  const issues = evenPacks.flatMap(({ pack }) => validateEven(pack));
  const known = Object.keys(naturals).length;
  const withImage = items.filter((item) => item.imageUrl).length;

  const heightRows = (evenPacks[0]?.pack.placed ?? []).slice(0, 8).map((box) => {
    const item = items[box.index]!;
    const visual = sizes[box.index]!;
    const natural = naturals[item.id];
    const expected = natural ? aVisualSize(natural.width, natural.height) : visual;
    return {
      rowKey: `${box.index}-${item.id}`,
      title: item.title,
      height: visual.height,
      expected: expected.height,
      match: Math.abs(visual.height - expected.height) < 0.05,
      pending: Boolean(item.imageUrl) && !natural,
    };
  });

  return (
    <div className={styles.root}>
      <p className={styles.lead}>
        各段の使用可能幅いっぱいに、ジャケット外形の隙間が等しくなる配置です。
        左右の余白は作品間の隙間の半分です。表示の高さは現行A案の contain
        実表示高（上限 {A_SLOT_SIZE}px）のままです。本番の5列と20作品／ページは変更していません。
      </p>

      <div className={styles.toolbar} role="toolbar" aria-label="均等配置比較">
        <div className={styles.btnGroup}>
          {(["A", "B", "C"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={
                view.kind === "single" && view.id === id
                  ? styles.toolBtnActive
                  : styles.toolBtn
              }
              aria-pressed={view.kind === "single" && view.id === id}
              onClick={() => setView({ kind: "single", id })}
            >
              {EVEN_LABELS[id]}
            </button>
          ))}
        </div>
        <div className={styles.btnGroup}>
          {(
            [
              ["A", "B"],
              ["A", "C"],
              ["B", "C"],
            ] as const
          ).map(([left, right]) => (
            <button
              key={`${left}${right}`}
              type="button"
              className={
                view.kind === "pair" && view.left === left && view.right === right
                  ? styles.toolBtnActive
                  : styles.toolBtn
              }
              aria-pressed={
                view.kind === "pair" && view.left === left && view.right === right
              }
              onClick={() => setView({ kind: "pair", left, right })}
            >
              {left} / {right}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.stats}>
        <div>
          <strong>画像サイズ確定:</strong> {known} / {withImage}
          （未確定は仮に {A_SLOT_SIZE}×{A_SLOT_SIZE}）
        </div>
        {visibleIds.includes("A") ? (
          <div>
            <strong>A:</strong> 各段5枠・枠 {A_SLOT_SIZE}px・20冊／ページ。座標は現行のまま。
          </div>
        ) : null}
        {evenPacks.map(({ id }) => (
          <div key={id}>
            <strong>{id}:</strong> {EVEN_COUNTS[id].join("-")}
            。表示サイズはA案の実表示サイズと同じ。
          </div>
        ))}
        {issues.length > 0 ? (
          <div className={styles.warn}>{issues.join(" / ")}</div>
        ) : (
          <div>隙間の均一・装飾帯・接地の検査: OK</div>
        )}
      </div>

      {evenPacks.map(({ id, pack }) => (
        <div className={styles.tableWrap} key={id}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{id}</th>
                <th>冊数</th>
                <th>使用可能幅</th>
                <th>作品幅合計</th>
                <th>作品間の隙間</th>
                <th>左右余白</th>
                <th>結果</th>
              </tr>
            </thead>
            <tbody>
              {pack.metrics.map((row) => (
                <tr key={`${id}-${row.bay}`}>
                  <td>{row.bay + 1}段</td>
                  <td>{row.count}</td>
                  <td>{row.usable.toFixed(0)}px</td>
                  <td>{row.widthSum.toFixed(1)}px</td>
                  <td>{row.gap.toFixed(1)}px</td>
                  <td>{row.side.toFixed(1)}px</td>
                  <td>{row.fits ? "配置" : row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className={styles.measure} aria-hidden>
        {items.map((item) =>
          item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={item.id}
              src={item.imageUrl}
              alt=""
              onLoad={(e) => {
                const img = e.currentTarget;
                onNatural(item.id, {
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
              }}
            />
          ) : null
        )}
      </div>

      {view.kind === "single" ? (
        <PackStage
          id={view.id}
          items={items}
          sizes={sizes}
          onOpen={onOpen}
          onNatural={onNatural}
        />
      ) : (
        <div className={styles.compareGrid}>
          <PackStage
            id={view.left}
            items={items}
            sizes={sizes}
            onOpen={onOpen}
            onNatural={onNatural}
          />
          <PackStage
            id={view.right}
            items={items}
            sizes={sizes}
            onOpen={onOpen}
            onNatural={onNatural}
          />
        </div>
      )}

      {heightRows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>作品</th>
                <th>実表示高</th>
                <th>A案の高さ</th>
                <th>一致</th>
              </tr>
            </thead>
            <tbody>
              {heightRows.map((row) => (
                <tr key={row.rowKey}>
                  <td>{row.title}</td>
                  <td>{row.pending ? "計測中" : row.height.toFixed(1)}</td>
                  <td>{row.pending ? "計測中" : row.expected.toFixed(1)}</td>
                  <td>{row.pending ? "—" : row.match ? "一致" : "不一致"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className={styles.meta}>
        背景 {IMAGE_SHELF_BG.src.split("?")[0]}。数値は1024px座標。
        透明な contain 余白は作品幅に含めません。DB未変更。
      </p>
    </div>
  );
}
