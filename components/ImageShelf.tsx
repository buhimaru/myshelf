"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import type { MediaItem } from "../types/media";
import { SHELF_TYPE_LABEL } from "../utils/shelfDisplay";
import {
  IMAGE_SHELF_BG,
  IMAGE_SHELF_COVER_SIZE,
  isNearImageShelfLed,
  layoutImageShelfPages,
  toImageShelfPercent,
  type ImageShelfPlacedBox,
  type ImageShelfSize,
} from "../utils/imageShelfLayout";
import {
  getLocalShelfPreviewRenderSpec,
  LOCAL_SHELF_CANDIDATE_PREVIEW,
  LOCAL_SHELF_D_BOOK_NO_IMAGE_PORTRAIT,
  localShelfDBookNoImageSize,
} from "../utils/imageShelfLocalPreview";
import {
  type VisualSize,
  aVisualSize,
} from "../app/dev/image-shelf-preview/intrinsicPackLayout";
import BookPaperbackCover from "./BookPaperbackCover";
import styles from "./ImageShelf.module.css";

type NaturalSize = { width: number; height: number };

/** 比較プレビュー等で背景・配置だけ差し替える。省略時は暫定採用版のまま */
export type ImageShelfRenderSpec = {
  bg: { src: string; width: number; height: number };
  layoutPages: (
    sizes: readonly ImageShelfSize[]
  ) => ImageShelfPlacedBox[][];
  toPercent: (box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    left: string;
    top: string;
    width: string;
    height: string;
  };
  isNearLed: (placed: {
    x: number;
    width: number;
    bay: number;
  }) => boolean;
};

type ImageShelfProps = {
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
  /** 通常棚の複数選択削除。未指定時は閲覧のみ（固定棚・他人の棚） */
  selectionMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
  /** 未指定時は現行の IMAGE_SHELF_* を使用（本番棚の見た目は変わらない） */
  renderSpec?: ImageShelfRenderSpec;
};

function square(): VisualSize {
  return { width: IMAGE_SHELF_COVER_SIZE, height: IMAGE_SHELF_COVER_SIZE };
}

/**
 * 表示上の最低横幅。配置の前に幅へ反映する。
 * 高さは contain のまま。80px未満だけ横に伸ばす。
 */
const MIN_COVER_WIDTH = 80;

function displaySize(visual: VisualSize): ImageShelfSize & { sourceWidth: number } {
  return {
    width: Math.max(visual.width, MIN_COVER_WIDTH),
    height: visual.height,
    sourceWidth: visual.width,
  };
}

export default function ImageShelf({
  items,
  onOpen,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  renderSpec,
}: ImageShelfProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [failedCovers, setFailedCovers] = useState<Set<string>>(() => new Set());
  const [naturals, setNaturals] = useState<Record<string, NaturalSize>>({});

  // 明示指定 > ローカル候補プレビュー > 暫定採用（本番定数）
  const resolvedSpec = renderSpec ?? getLocalShelfPreviewRenderSpec();
  const bg = resolvedSpec?.bg ?? IMAGE_SHELF_BG;
  const layoutPages = resolvedSpec?.layoutPages ?? layoutImageShelfPages;
  const toPercent = resolvedSpec?.toPercent ?? toImageShelfPercent;
  const isNearLedFn = resolvedSpec?.isNearLed ?? isNearImageShelfLed;

  const onNatural = (id: string, size: NaturalSize) => {
    setNaturals((prev) => {
      const cur = prev[id];
      if (cur && cur.width === size.width && cur.height === size.height) return prev;
      return { ...prev, [id]: size };
    });
  };

  const readyItems = useMemo(() => {
    const ready: {
      item: MediaItem;
      size: ImageShelfSize & { sourceWidth: number };
    }[] = [];
    for (const item of items) {
      const coverKey = `${item.id}\0${item.imageUrl ?? ""}`;
      if (!item.imageUrl || failedCovers.has(coverKey)) {
        // ローカル通常棚 D のみ: 本 NO IMAGE をゲームジャケット相当の縦長に
        const useBookPortrait =
          !renderSpec &&
          LOCAL_SHELF_CANDIDATE_PREVIEW === "D" &&
          LOCAL_SHELF_D_BOOK_NO_IMAGE_PORTRAIT &&
          item.type === "book";
        ready.push({
          item,
          size: displaySize(
            useBookPortrait ? localShelfDBookNoImageSize() : square()
          ),
        });
        continue;
      }
      const natural = naturals[item.id];
      if (!natural) break;
      ready.push({
        item,
        size: displaySize(aVisualSize(natural.width, natural.height)),
      });
    }
    return ready;
  }, [items, naturals, failedCovers, renderSpec]);

  const pages = useMemo(
    () => layoutPages(readyItems.map((entry) => entry.size)),
    [readyItems, layoutPages]
  );
  const pageCount = Math.max(1, pages.length);
  const safePage = Math.min(pageIndex, pageCount - 1);

  useEffect(() => {
    if (pageIndex !== safePage) setPageIndex(safePage);
  }, [pageIndex, safePage]);

  const pageOffset = pages
    .slice(0, safePage)
    .reduce((sum, page) => sum + page.length, 0);
  const pageEntries = (pages[safePage] ?? []).map((box, index) => {
    const entry = readyItems[pageOffset + index];
    return entry ? { ...entry, box } : null;
  });

  const markFailed = (key: string) => {
    setFailedCovers((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  return (
    <div className={styles.root}>
      <div
        className={styles.stage}
        style={{
          aspectRatio: `${bg.width} / ${bg.height}`,
          ["--shelf-w" as string]: String(bg.width),
          ["--shelf-h" as string]: String(bg.height),
        }}
      >
        <Image
          src={bg.src}
          alt=""
          width={bg.width}
          height={bg.height}
          className={styles.bg}
          priority
          unoptimized
        />

        <div className={styles.measure} aria-hidden>
          {items.map((item) =>
            item.imageUrl &&
            !failedCovers.has(`${item.id}\0${item.imageUrl}`) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${item.id}\0${item.imageUrl}`}
                src={item.imageUrl}
                alt=""
                ref={(img) => {
                  // キャッシュ済みだと onLoad が再発火しないため、計測済みサイズを取り込む
                  if (
                    img &&
                    img.complete &&
                    img.naturalWidth > 0 &&
                    img.naturalHeight > 0
                  ) {
                    onNatural(item.id, {
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                    });
                  }
                }}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    onNatural(item.id, {
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                    });
                  }
                }}
                onError={() => markFailed(`${item.id}\0${item.imageUrl ?? ""}`)}
              />
            ) : null
          )}
        </div>

        <div className={styles.coverLayer} aria-label="登録作品">
          {pageEntries.map((entry, index) => {
            if (!entry) return null;
            const { item: pageItem, box, size } = entry;
            const pct = toPercent(box);
            const widened = box.width > size.sourceWidth + 0.05;
            const nearLed = isNearLedFn(box);
            const coverKey = `${pageItem.id}\0${pageItem.imageUrl ?? ""}`;
            const showImage =
              Boolean(pageItem.imageUrl) && !failedCovers.has(coverKey);
            const genre = SHELF_TYPE_LABEL[pageItem.type] ?? "作品";
            const isSelected = Boolean(selectedIds?.has(pageItem.id));
            const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
              const img = event.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                onNatural(pageItem.id, {
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
              }
            };

            return (
              <button
                key={`${safePage}-${pageItem.id}`}
                type="button"
                className={`${styles.coverBtn}${showImage ? "" : ` ${styles.coverBtnText}`}${nearLed ? ` ${styles.coverNearLed}` : ""}${selectionMode ? ` ${styles.coverSelecting}` : ""}${isSelected ? ` ${styles.coverSelected}` : ""}`}
                style={{
                  left: pct.left,
                  top: pct.top,
                  width: pct.width,
                  height: pct.height,
                }}
                onClick={() => {
                  if (selectionMode) {
                    onToggleSelect?.(pageItem.id);
                    return;
                  }
                  onOpen(pageItem);
                }}
                aria-label={
                  selectionMode
                    ? isSelected
                      ? `${pageItem.title}の選択を解除`
                      : `${pageItem.title}を選択`
                    : `${pageItem.title}の詳細を開く`
                }
                aria-pressed={selectionMode ? isSelected : undefined}
                data-bay={box.bay}
                data-index={index}
                data-layout-width={size.sourceWidth.toFixed(2)}
                data-width={box.width.toFixed(2)}
                data-height={box.height.toFixed(2)}
                data-left={box.x.toFixed(2)}
                data-right={(box.x + box.width).toFixed(2)}
                data-center={(box.x + box.width / 2).toFixed(2)}
                data-bottom={(box.y + box.height).toFixed(2)}
                data-widened={widened ? "1" : "0"}
                data-selected={isSelected ? "1" : "0"}
              >
                <span className={styles.coverShadow} aria-hidden />
                {showImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pageItem.imageUrl}
                    alt=""
                    className={widened ? `${styles.coverImg} ${styles.coverImgWide}` : styles.coverImg}
                    draggable={false}
                    onLoad={onLoad}
                    onError={() => markFailed(coverKey)}
                  />
                ) : pageItem.type === "book" ? (
                  <BookPaperbackCover
                    title={pageItem.title}
                    creator={pageItem.creator}
                    variant="shelf"
                  />
                ) : (
                  <span className={styles.coverFallback}>
                    <span className={styles.coverFallbackLabel}>NO IMAGE</span>
                    <span className={styles.coverFallbackTitle}>
                      {pageItem.title}
                    </span>
                    <span className={styles.coverFallbackGenre}>{genre}</span>
                  </span>
                )}
                <span className={styles.coverLight} aria-hidden />
                {selectionMode && isSelected ? (
                  <span className={styles.coverCheck} aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {pageCount > 1 ? (
        <div className={styles.pager} role="navigation" aria-label="棚のページ">
          <button
            type="button"
            className={styles.pagerBtn}
            disabled={safePage <= 0}
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
          >
            前のページ
          </button>
          <label className={styles.pagerSelectLabel}>
            <span className={styles.srOnly}>ページを選択</span>
            <select
              className={styles.pagerSelect}
              value={safePage}
              aria-label={`ページ ${safePage + 1} / ${pageCount}`}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                setPageIndex(Math.max(0, Math.min(pageCount - 1, next)));
              }}
            >
              {Array.from({ length: pageCount }, (_, index) => (
                <option key={index} value={index}>
                  {index + 1} / {pageCount}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.pagerBtn}
            disabled={safePage >= pageCount - 1}
            onClick={() =>
              setPageIndex((p) => Math.min(pageCount - 1, p + 1))
            }
          >
            次のページ
          </button>
        </div>
      ) : null}
    </div>
  );
}
