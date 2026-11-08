"use client";

/**
 * 表紙フィット A〜E 比較（プレビュー専用）。
 * 本番 ImageShelf の表示方式・背景・座標は変更しない。
 */

import Image from "next/image";
import {
  useCallback,
  useMemo,
  useState,
  type SyntheticEvent,
} from "react";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import {
  IMAGE_SHELF_BG,
  imageShelfSlotsForPage,
  isNearImageShelfLed,
  toImageShelfPercent,
} from "../../../utils/imageShelfLayout";
import { COVER_SHELF_RICH_ITEMS } from "../cover-shelf-preview/items";
import styles from "./CoverFitCompare.module.css";
import {
  COVER_FIT_LABELS,
  COVER_FIT_MODES,
  COVER_FIT_SCALE,
  type CoverFitMode,
  fitImageBox,
  isContainFitMode,
} from "./coverFit";

type ComparePair = { kind: "single"; mode: CoverFitMode } | {
  kind: "pair";
  left: CoverFitMode;
  right: CoverFitMode;
};

export type CoverFitBgOption = {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
};

/** 表紙フィット比較は5列20枠のまま。本番の25件ページとは分ける */
const COVER_FIT_PAGE_SIZE = 20;

/** 見切れ比較用に縦長漫画・正方形CD・横長映画を先頭3枠へ */
const PRIORITY_IDS = [
  "spine-preview-manga-1", // ONE PIECE（縦長）
  "spine-preview-music-0", // Abbey Road（正方形）
  "spine-preview-movie-1", // ローマの休日（ポスター寄り）
] as const;

function buildCompareItems(): MediaItem[] {
  const byId = new Map(COVER_SHELF_RICH_ITEMS.map((i) => [i.id, i]));
  const picked: MediaItem[] = [];
  for (const id of PRIORITY_IDS) {
    const item = byId.get(id);
    if (item) picked.push(item);
  }
  for (const item of COVER_SHELF_RICH_ITEMS) {
    if (picked.some((p) => p.id === item.id)) continue;
    picked.push(item);
    if (picked.length >= COVER_FIT_PAGE_SIZE) break;
  }
  // NO IMAGE 確認用（枠は維持・縮小しない）
  if (picked.length < COVER_FIT_PAGE_SIZE) {
    const noImage: MediaItem = {
      id: "cover-fit-no-image-demo",
      title: "NO IMAGE 確認用",
      creator: null,
      type: "book",
      imageUrl: undefined,
      description: null,
      createdAt: new Date().toISOString(),
    };
    picked.push(noImage);
  }
  return picked.slice(0, COVER_FIT_PAGE_SIZE);
}

function FittedCoverMedia({
  mode,
  imageUrl,
  nearLed,
  onError,
}: {
  mode: CoverFitMode;
  imageUrl: string;
  nearLed: boolean;
  onError: () => void;
}) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null
  );
  const scale = COVER_FIT_SCALE[mode];

  const onLoad = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      if (!isContainFitMode(mode)) return;
      const img = e.currentTarget;
      const btn = img.closest("button");
      if (!btn) return;
      const slotW = btn.clientWidth;
      const slotH = btn.clientHeight;
      setBox(
        fitImageBox(
          img.naturalWidth,
          img.naturalHeight,
          slotW,
          slotH,
          scale
        )
      );
    },
    [mode, scale]
  );

  if (mode === "A") {
    return (
      <>
        <span className={styles.coverShadow} aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className={styles.coverImgCover}
          draggable={false}
          onError={onError}
        />
        <span className={styles.coverLight} aria-hidden />
      </>
    );
  }

  return (
    <span className={styles.coverFitWrap}>
      <span
        className={`${styles.coverFitInner}${nearLed ? ` ${styles.coverNearLed}` : ""}`}
        style={
          box
            ? { width: box.width, height: box.height }
            : {
                width: `${scale * 100}%`,
                height: `${scale * 100}%`,
              }
        }
      >
        <span className={styles.coverShadow} aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className={styles.coverImgContain}
          draggable={false}
          onLoad={onLoad}
          onError={onError}
        />
        <span className={styles.coverLight} aria-hidden />
      </span>
    </span>
  );
}

function CoverFitStage({
  mode,
  items,
  label,
  onOpen,
  bg,
  largeStage = false,
}: {
  mode: CoverFitMode;
  items: MediaItem[];
  label: string;
  onOpen: (item: MediaItem) => void;
  bg?: CoverFitBgOption;
  largeStage?: boolean;
}) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const slots = useMemo(() => imageShelfSlotsForPage(0), []);
  const shelfBg = bg ?? {
    id: "default",
    label: "IMAGE_SHELF_BG",
    src: IMAGE_SHELF_BG.src,
    width: IMAGE_SHELF_BG.width,
    height: IMAGE_SHELF_BG.height,
  };

  const markFailed = (key: string) => {
    setFailed((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  return (
    <div className={styles.stageWrap}>
      <p className={styles.stageLabel}>{label}</p>
      <div
        className={largeStage ? `${styles.stage} ${styles.stageLarge}` : styles.stage}
        style={{
          aspectRatio: `${shelfBg.width} / ${shelfBg.height}`,
        }}
        data-cover-fit={mode}
        data-shelf-bg={shelfBg.id}
      >
        <Image
          src={shelfBg.src}
          alt=""
          width={shelfBg.width}
          height={shelfBg.height}
          className={styles.bg}
          priority
          unoptimized
        />
        <div className={styles.coverLayer} aria-label="登録作品（プレビュー）">
          {slots.map((slot) => {
            const item = items[slot.globalIndex];
            if (!item) return null;
            const pct = toImageShelfPercent(slot);
            const nearLed = isNearImageShelfLed(slot);
            const coverKey = `${item.id}\0${item.imageUrl ?? ""}`;
            const showImage =
              Boolean(item.imageUrl) && !failed.has(coverKey);
            const genre = SHELF_TYPE_LABEL[item.type] ?? "作品";

            return (
              <button
                key={`${mode}-${item.id}-${slot.bay}-${slot.slot}`}
                type="button"
                className={`${styles.coverBtn}${nearLed ? ` ${styles.coverNearLed}` : ""}`}
                style={{
                  left: pct.left,
                  top: pct.top,
                  width: pct.width,
                  height: pct.height,
                }}
                onClick={() => onOpen(item)}
                aria-label={`${item.title}の詳細を開く`}
                data-bay={slot.bay}
                data-slot={slot.slot}
                data-cover-fit={mode}
              >
                {showImage && item.imageUrl ? (
                  <FittedCoverMedia
                    mode={mode}
                    imageUrl={item.imageUrl}
                    nearLed={nearLed}
                    onError={() => markFailed(coverKey)}
                  />
                ) : (
                  <>
                    <span className={styles.coverShadow} aria-hidden />
                    <span className={styles.coverFallback}>
                      <span className={styles.coverFallbackLabel}>NO IMAGE</span>
                      <span className={styles.coverFallbackTitle}>
                        {item.title}
                      </span>
                      <span>{genre}</span>
                    </span>
                    <span className={styles.coverLight} aria-hidden />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ZoomAspectCard({
  title,
  item,
  leftMode,
  rightMode,
}: {
  title: string;
  item: MediaItem | undefined;
  leftMode: CoverFitMode;
  rightMode: CoverFitMode;
}) {
  if (!item?.imageUrl) return null;

  return (
    <div className={styles.zoomCard}>
      <p className={styles.zoomCardTitle}>
        {title} — {item.title}
      </p>
      <div className={styles.zoomPair}>
        {([leftMode, rightMode] as const).map((mode) => (
          <div key={mode}>
            <div className={styles.zoomSlot}>
              <div className={styles.zoomSlotInner}>
                <button
                  type="button"
                  className={styles.coverBtn}
                  style={{
                    left: 0,
                    top: 0,
                    width: "100%",
                    height: "100%",
                    position: "relative",
                  }}
                  tabIndex={-1}
                  aria-hidden
                >
                  <FittedCoverMedia
                    mode={mode}
                    imageUrl={item.imageUrl!}
                    nearLed={false}
                    onError={() => {}}
                  />
                </button>
              </div>
            </div>
            <p className={styles.zoomSlotLabel}>{mode}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type CoverFitCompareProps = {
  onOpen: (item: MediaItem) => void;
  /** 背景切替候補。未指定時は IMAGE_SHELF_BG 固定（既存挙動） */
  bgOptions?: readonly CoverFitBgOption[];
  initialBgId?: string;
  /** 棚を大きめ表示（背景比較用） */
  largeStage?: boolean;
  leadText?: string;
};

export default function CoverFitCompare({
  onOpen,
  bgOptions,
  initialBgId,
  largeStage = false,
  leadText,
}: CoverFitCompareProps) {
  const [view, setView] = useState<ComparePair>({ kind: "single", mode: "A" });
  const items = useMemo(() => buildCompareItems(), []);
  const hasBgSwitch = Boolean(bgOptions && bgOptions.length > 0);
  const [bgId, setBgId] = useState(() => {
    if (!bgOptions?.length) return "";
    if (initialBgId && bgOptions.some((o) => o.id === initialBgId)) {
      return initialBgId;
    }
    return bgOptions[0]!.id;
  });

  const activeBg = useMemo(() => {
    if (!hasBgSwitch || !bgOptions) {
      return {
        id: "default",
        label: "現行 IMAGE_SHELF_BG",
        src: IMAGE_SHELF_BG.src,
        width: IMAGE_SHELF_BG.width,
        height: IMAGE_SHELF_BG.height,
      } satisfies CoverFitBgOption;
    }
    return bgOptions.find((o) => o.id === bgId) ?? bgOptions[0]!;
  }, [hasBgSwitch, bgOptions, bgId]);

  const manga = items.find((i) => i.id === PRIORITY_IDS[0]);
  const music = items.find((i) => i.id === PRIORITY_IDS[1]);
  const movie = items.find((i) => i.id === PRIORITY_IDS[2]);

  const zoomLeft: CoverFitMode = view.kind === "pair" ? view.left : "A";
  const zoomRight: CoverFitMode =
    view.kind === "pair"
      ? view.right
      : view.mode === "A"
        ? "D"
        : view.mode;

  return (
    <div className={styles.root}>
      <p className={styles.lead}>
        {leadText ??
          "表紙フィット比較（プレビュー専用）。背景は正式採用の新素材5冊＋新空棚。配置枠の座標・サイズは本番と同じ。縮小は画像本体のみ・下端基準。本番の画像棚表示には未適用です。"}
      </p>

      {hasBgSwitch ? (
        <div className={styles.toolbar} role="toolbar" aria-label="棚背景の切替">
          <div className={styles.btnGroup}>
            {bgOptions!.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={
                  bgId === opt.id ? styles.toolBtnActive : styles.toolBtn
                }
                aria-pressed={bgId === opt.id}
                onClick={() => setBgId(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.toolbar} role="toolbar" aria-label="表紙フィット方式">
        <div className={styles.btnGroup}>
          {COVER_FIT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={
                view.kind === "single" && view.mode === mode
                  ? styles.toolBtnActive
                  : styles.toolBtn
              }
              aria-pressed={view.kind === "single" && view.mode === mode}
              onClick={() => setView({ kind: "single", mode })}
            >
              {COVER_FIT_LABELS[mode]}
            </button>
          ))}
        </div>
        <div className={styles.btnGroup}>
          {(["B", "C", "D", "E"] as const).map((right) => (
            <button
              key={`A-${right}`}
              type="button"
              className={
                view.kind === "pair" && view.right === right
                  ? styles.toolBtnActive
                  : styles.toolBtn
              }
              aria-pressed={view.kind === "pair" && view.right === right}
              onClick={() => setView({ kind: "pair", left: "A", right })}
            >
              A / {right} 比較
            </button>
          ))}
        </div>
      </div>

      {view.kind === "single" ? (
        <CoverFitStage
          mode={view.mode}
          items={items}
          label={`${COVER_FIT_LABELS[view.mode]} · ${activeBg.label}`}
          onOpen={onOpen}
          bg={activeBg}
          largeStage={largeStage}
        />
      ) : (
        <div className={styles.compareGrid}>
          <CoverFitStage
            mode={view.left}
            items={items}
            label={`${COVER_FIT_LABELS[view.left]} · ${activeBg.label}`}
            onOpen={onOpen}
            bg={activeBg}
            largeStage={largeStage}
          />
          <CoverFitStage
            mode={view.right}
            items={items}
            label={`${COVER_FIT_LABELS[view.right]} · ${activeBg.label}`}
            onOpen={onOpen}
            bg={activeBg}
            largeStage={largeStage}
          />
        </div>
      )}

      <section className={styles.zoomSection} aria-label="アスペクト別拡大比較">
        <h2 className={styles.zoomTitle}>
          縦長・正方形・横長の拡大比較（見切れと接地）
        </h2>
        <p className={styles.zoomLead}>
          左が基準（単体表示時はその方式、横並び時は A）。右が比較対象。
          下端接地と上下の見切れを確認してください。影は画像外形に追従します。
        </p>
        <div className={styles.zoomGrid}>
          <ZoomAspectCard
            title="縦長（漫画）"
            item={manga}
            leftMode={zoomLeft}
            rightMode={zoomRight}
          />
          <ZoomAspectCard
            title="正方形（CD）"
            item={music}
            leftMode={zoomLeft}
            rightMode={zoomRight}
          />
          <ZoomAspectCard
            title="横長寄り（映画）"
            item={movie}
            leftMode={zoomLeft}
            rightMode={zoomRight}
          />
        </div>
      </section>

      <p className={styles.meta}>
        背景 {activeBg.src.split("?")[0]}。枠{" "}
        {COVER_FIT_PAGE_SIZE}・座標は5列の imageShelfSlotsForPage と同一。DB 未変更。
      </p>
    </div>
  );
}
