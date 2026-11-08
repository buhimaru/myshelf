"use client";

/**
 * 密配置比較（5列 / 8列 / 9列 / 代替7列）。
 * contain 100%・下端接地。本番 ImageShelf・既存5列定数は未変更。
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
  isNearImageShelfLed,
} from "../../../utils/imageShelfLayout";
import { COVER_SHELF_RICH_ITEMS } from "../cover-shelf-preview/items";
import { fitImageBox } from "./coverFit";
import styles from "./DenseShelfCompare.module.css";
import {
  DENSE_PRESETS,
  DENSE_SAFE_BANDS,
  type DensePresetId,
  denseSlotsForPreset,
  denseToPercent,
  validateDensePreset,
} from "./denseShelfLayout";

type ViewState =
  | { kind: "single"; id: DensePresetId }
  | { kind: "pair"; left: DensePresetId; right: DensePresetId };

const PRIORITY_IDS = [
  "spine-preview-manga-1",
  "spine-preview-music-0",
  "spine-preview-movie-1",
] as const;

function buildItems(needed: number): MediaItem[] {
  const byId = new Map(COVER_SHELF_RICH_ITEMS.map((i) => [i.id, i]));
  const base: MediaItem[] = [];
  for (const id of PRIORITY_IDS) {
    const item = byId.get(id);
    if (item) base.push(item);
  }
  for (const item of COVER_SHELF_RICH_ITEMS) {
    if (base.some((p) => p.id === item.id)) continue;
    base.push(item);
  }
  // 枠数に合わせてプレビュー専用に循環複製（DB非変更）
  const out: MediaItem[] = [];
  let n = 0;
  while (out.length < needed) {
    const src = base[n % base.length]!;
    out.push({
      ...src,
      id: `${src.id}__dense-${out.length}`,
      title: src.title,
    });
    n += 1;
  }
  // NO IMAGE を1枠混ぜる
  if (out.length > 4) {
    out[4] = {
      id: "dense-no-image",
      title: "NO IMAGE 確認用",
      creator: null,
      type: "book",
      imageUrl: undefined,
      description: null,
    };
  }
  return out;
}

function ContainCover({
  imageUrl,
  nearLed,
  onError,
}: {
  imageUrl: string;
  nearLed: boolean;
  onError: () => void;
}) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null
  );

  const onLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const btn = img.closest("button");
    if (!btn) return;
    setBox(
      fitImageBox(
        img.naturalWidth,
        img.naturalHeight,
        btn.clientWidth,
        btn.clientHeight,
        1
      )
    );
  }, []);

  return (
    <span className={styles.coverFitWrap}>
      <span
        className={`${styles.coverFitInner}${nearLed ? ` ${styles.coverNearLed}` : ""}`}
        style={
          box
            ? { width: box.width, height: box.height }
            : { width: "100%", height: "100%" }
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

function DenseStage({
  presetId,
  items,
  onOpen,
}: {
  presetId: DensePresetId;
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
}) {
  const preset = DENSE_PRESETS[presetId];
  const slots = useMemo(() => denseSlotsForPreset(presetId), [presetId]);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

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
      <p className={styles.stageLabel}>
        {preset.label}（枠 {preset.pageSlotCount} / 段{" "}
        {preset.bayCounts.join("-")}）
      </p>
      <div
        className={styles.stage}
        style={{
          aspectRatio: `${IMAGE_SHELF_BG.width} / ${IMAGE_SHELF_BG.height}`,
        }}
        data-dense-preset={presetId}
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
        <div className={styles.coverLayer} aria-label="密配置プレビュー作品">
          {slots.map((slot) => {
            const item = items[slot.globalIndex];
            if (!item) return null;
            const pct = denseToPercent(slot);
            const nearLed = isNearImageShelfLed(slot);
            const coverKey = `${item.id}\0${item.imageUrl ?? ""}`;
            const showImage =
              Boolean(item.imageUrl) && !failed.has(coverKey);
            const genre = SHELF_TYPE_LABEL[item.type] ?? "作品";

            return (
              <button
                key={`${presetId}-${slot.bay}-${slot.slot}-${item.id}`}
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
              >
                {showImage && item.imageUrl ? (
                  <ContainCover
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

type DenseShelfCompareProps = {
  onOpen: (item: MediaItem) => void;
};

export default function DenseShelfCompare({ onOpen }: DenseShelfCompareProps) {
  const [view, setView] = useState<ViewState>({ kind: "pair", left: "five", right: "eight" });

  const activeIds: DensePresetId[] =
    view.kind === "single" ? [view.id] : [view.left, view.right];
  const maxSlots = Math.max(
    ...activeIds.map((id) => DENSE_PRESETS[id].pageSlotCount)
  );
  const items = useMemo(() => buildItems(maxSlots), [maxSlots]);

  const validations = useMemo(() => {
    const ids: DensePresetId[] = ["five", "eight", "nine", "seven"];
    return Object.fromEntries(
      ids.map((id) => [id, validateDensePreset(id)])
    ) as Record<DensePresetId, ReturnType<typeof validateDensePreset>>;
  }, []);

  const focusId =
    view.kind === "single" ? view.id : view.right;
  const focus = DENSE_PRESETS[focusId];

  return (
    <div className={styles.root}>
      <p className={styles.lead}>
        密配置比較（プレビュー専用）。既存5列の座標・サイズは保存したまま、
        8/9列は独立プリセットです。表示はすべて contain 100%・下端接地。
        背景は正式採用 newbooks。本番の配置・ページ切替（20/ページ）は未変更です。
      </p>

      <div className={styles.toolbar} role="toolbar" aria-label="密配置プリセット">
        <div className={styles.btnGroup}>
          {(
            [
              ["five", "A：5列"],
              ["eight", "B：8列"],
              ["nine", "C：9列"],
              ["seven", "D：7列代替"],
            ] as const
          ).map(([id, label]) => (
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
              {label}
            </button>
          ))}
        </div>
        <div className={styles.btnGroup}>
          {(
            [
              ["eight", "A / B（5 vs 8）"],
              ["nine", "A / C（5 vs 9）"],
              ["seven", "A / D（5 vs 7）"],
            ] as const
          ).map(([right, label]) => (
            <button
              key={right}
              type="button"
              className={
                view.kind === "pair" && view.right === right
                  ? styles.toolBtnActive
                  : styles.toolBtn
              }
              aria-pressed={view.kind === "pair" && view.right === right}
              onClick={() =>
                setView({ kind: "pair", left: "five", right })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.stats}>
        <div>
          <strong>安全帯:</strong>{" "}
          {DENSE_SAFE_BANDS.map(
            (b) =>
              `${b.bay + 1}段 x=${b.left}–${b.right}（幅${b.right - b.left}）`
          ).join(" / ")}
        </div>
        <div>
          <strong>表示中:</strong> {focus.label} — 段ごと{" "}
          {focus.bayCounts.map((n, i) => `${i + 1}段${n}`).join("・")} — 合計{" "}
          {focus.pageSlotCount} 枠/ページ（試算）。本番は引き続き 20 枠/ページ。
        </div>
        <div>
          <strong>サイズ:</strong>{" "}
          {focus.bays
            .map((b) => `${b.bay + 1}段 ${b.size}px×${b.xs.length}`)
            .join(" / ")}
        </div>
        {!validations[focusId].ok ? (
          <div className={styles.warn}>
            検証警告: {validations[focusId].issues.join("; ")}
          </div>
        ) : (
          <div>固定装飾との帯検査: OK（レコード・ネイビー5冊と非重複）</div>
        )}
        <div>{focus.summary}</div>
      </div>

      {view.kind === "single" ? (
        <DenseStage presetId={view.id} items={items} onOpen={onOpen} />
      ) : (
        <div className={styles.compareGrid}>
          <DenseStage presetId={view.left} items={items} onOpen={onOpen} />
          <DenseStage presetId={view.right} items={items} onOpen={onOpen} />
        </div>
      )}

      <p className={styles.meta}>
        既存5列スナップショットは denseShelfLayout の DENSE_REF_FIVE_BAYS。
        utils/imageShelfLayout.ts の IMAGE_SHELF_BAYS は未変更。DB 未変更。
      </p>
    </div>
  );
}
