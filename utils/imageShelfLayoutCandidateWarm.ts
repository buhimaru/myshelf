/**
 * 新候補C「温もりの木製レコード棚」用の配置定数（1024×662）。
 * A（暫定採用）・B（狭い木目候補）とは完全に別系統。上書きしない。
 *
 * 調整前パラメータは CANDIDATE_WARM_*_BEFORE / layoutCandidateWarmShelfPagesBefore で保持。
 */

import type {
  ImageShelfPlacedBox,
  ImageShelfSize,
} from "./imageShelfLayout";

/** 候補C背景（別名で保存。採用画像・候補Bは上書きしない） */
export const CANDIDATE_WARM_SHELF_BG = {
  src: "/images/shelf-warm-wood-candidate.jpg?v=warm-wood-candidate",
  width: 1024,
  height: 662,
} as const;

/** LED は左寄り（調整前後共通） */
export const CANDIDATE_WARM_SHELF_LED_CENTER_X = 133;

/** 4段目の相対拡大（調整前後共通。ジャンル比率とは別） */
export const CANDIDATE_WARM_SHELF_BAY3_SIZE_SCALE = 1.05;

type WarmRow = {
  bay: number;
  bottomY: number;
  regionLeft: number;
  regionRight: number;
};

type WarmLayoutConfig = {
  gap: number;
  /** 全作品に一律適用。縦横比・ジャンル相対は維持 */
  coverScale: number;
  rows: readonly WarmRow[];
  /**
   * 段ごとの追加倍率（coverScale・BAY3 のあと）。省略時は全段 1。
   * 縦横比は維持したまま均一に掛ける。
   */
  bayExtraScale?: readonly [number, number, number, number];
};

/**
 * 調整前（初回寄せ）。復元・比較用。変更しない。
 * GAP 12 / 拡大なし / bottomY 157·289·435·600
 */
export const CANDIDATE_WARM_SHELF_LAYOUT_BEFORE = {
  gap: 12,
  coverScale: 1,
  rows: [
    { bay: 0, bottomY: 157, regionLeft: 78, regionRight: 946 },
    { bay: 1, bottomY: 289, regionLeft: 78, regionRight: 946 },
    { bay: 2, bottomY: 435, regionLeft: 78, regionRight: 800 },
    { bay: 3, bottomY: 600, regionLeft: 185, regionRight: 946 },
  ],
} as const satisfies WarmLayoutConfig;

/**
 * 微調整後。
 * - coverScale 1.05（全体 +5%）
 * - GAP 8（やや密）
 * - 3・4段目 bottomY を奥へ（−7）
 */
export const CANDIDATE_WARM_SHELF_LAYOUT = {
  gap: 8,
  coverScale: 1.05,
  rows: [
    { bay: 0, bottomY: 157, regionLeft: 78, regionRight: 946 },
    { bay: 1, bottomY: 289, regionLeft: 78, regionRight: 946 },
    { bay: 2, bottomY: 428, regionLeft: 78, regionRight: 800 },
    { bay: 3, bottomY: 593, regionLeft: 185, regionRight: 946 },
  ],
} as const satisfies WarmLayoutConfig;

/**
 * 追加調整 D（C の完全コピー＋3点のみ）。
 * - 2段目: サイズ ×0.975（約 −2.5%）
 * - 3段目: bottomY 428→432（+4・手前）
 * - 4段目: サイズ ×1.045（約 +4.5%）
 */
export const CANDIDATE_WARM_SHELF_LAYOUT_D = {
  gap: CANDIDATE_WARM_SHELF_LAYOUT.gap,
  coverScale: CANDIDATE_WARM_SHELF_LAYOUT.coverScale,
  rows: [
    { bay: 0, bottomY: 157, regionLeft: 78, regionRight: 946 },
    { bay: 1, bottomY: 289, regionLeft: 78, regionRight: 946 },
    { bay: 2, bottomY: 432, regionLeft: 78, regionRight: 800 },
    { bay: 3, bottomY: 593, regionLeft: 185, regionRight: 946 },
  ],
  bayExtraScale: [1, 0.975, 1, 1.045],
} as const satisfies WarmLayoutConfig;

/** @deprecated 微調整後の公開エイリアス */
export const CANDIDATE_WARM_SHELF_GAP = CANDIDATE_WARM_SHELF_LAYOUT.gap;
/** @deprecated 微調整後の公開エイリアス */
export const CANDIDATE_WARM_SHELF_ROWS = CANDIDATE_WARM_SHELF_LAYOUT.rows;

function contentLeft(row: WarmRow, gap: number): number {
  return row.regionLeft + gap;
}

function contentRight(row: WarmRow, gap: number): number {
  return row.regionRight - gap;
}

function scaleSize(size: ImageShelfSize, coverScale: number): ImageShelfSize {
  if (coverScale === 1) return size;
  return {
    width: size.width * coverScale,
    height: size.height * coverScale,
  };
}

function sizeForBay(
  bay: number,
  size: ImageShelfSize,
  coverScale: number,
  bayExtraScale?: readonly [number, number, number, number]
): ImageShelfSize {
  let scaled = scaleSize(size, coverScale);
  if (bay === 3 && CANDIDATE_WARM_SHELF_BAY3_SIZE_SCALE !== 1) {
    scaled = {
      width: scaled.width * CANDIDATE_WARM_SHELF_BAY3_SIZE_SCALE,
      height: scaled.height * CANDIDATE_WARM_SHELF_BAY3_SIZE_SCALE,
    };
  }
  const extra = bayExtraScale?.[bay] ?? 1;
  if (extra === 1) return scaled;
  return {
    width: scaled.width * extra,
    height: scaled.height * extra,
  };
}

function placeEvenRow(
  row: WarmRow,
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[] {
  const span = row.regionRight - row.regionLeft;
  const widthSum = sizes.reduce((sum, size) => sum + size.width, 0);
  const gap = (span - widthSum) / (sizes.length + 1);
  let x = row.regionLeft + gap;
  return sizes.map((size) => {
    const box: ImageShelfPlacedBox = {
      bay: row.bay,
      x,
      y: row.bottomY - size.height,
      width: size.width,
      height: size.height,
    };
    x += size.width + gap;
    return box;
  });
}

function placePackedRow(
  row: WarmRow,
  sizes: readonly ImageShelfSize[],
  gap: number
): ImageShelfPlacedBox[] {
  let x = row.regionLeft + gap;
  return sizes.map((size) => {
    const box: ImageShelfPlacedBox = {
      bay: row.bay,
      x,
      y: row.bottomY - size.height,
      width: size.width,
      height: size.height,
    };
    x += size.width + gap;
    return box;
  });
}

function layoutWithConfig(
  sizes: readonly ImageShelfSize[],
  config: WarmLayoutConfig
): ImageShelfPlacedBox[][] {
  const pages: ImageShelfPlacedBox[][] = [];
  let index = 0;
  while (index < sizes.length) {
    const pageStart = index;
    const filled: { row: WarmRow; sizes: ImageShelfSize[] }[] = [];
    for (const row of config.rows) {
      if (index >= sizes.length) break;
      const left = contentLeft(row, config.gap);
      const right = contentRight(row, config.gap);
      let cursor = left;
      const rowSizes: ImageShelfSize[] = [];
      while (index < sizes.length) {
        const size = sizes[index];
        if (!size) break;
        const placed = sizeForBay(
          row.bay,
          size,
          config.coverScale,
          config.bayExtraScale
        );
        if (cursor + placed.width > right + 0.001) break;
        rowSizes.push(placed);
        cursor += placed.width + config.gap;
        index += 1;
      }
      if (rowSizes.length > 0) filled.push({ row, sizes: rowSizes });
    }
    if (index === pageStart) {
      const size = sizes[index];
      const row = config.rows[0];
      if (!size || !row) break;
      filled.push({
        row,
        sizes: [
          sizeForBay(
            row.bay,
            size,
            config.coverScale,
            config.bayExtraScale
          ),
        ],
      });
      index += 1;
    }
    const page = filled.flatMap((entry, rowIndex) => {
      const finalized = rowIndex < filled.length - 1 || index < sizes.length;
      return finalized
        ? placeEvenRow(entry.row, entry.sizes)
        : placePackedRow(entry.row, entry.sizes, config.gap);
    });
    pages.push(page);
  }
  return pages;
}

/** 微調整後の配置 */
export function layoutCandidateWarmShelfPages(
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[][] {
  return layoutWithConfig(sizes, CANDIDATE_WARM_SHELF_LAYOUT);
}

/** 調整前の配置（比較・復元用） */
export function layoutCandidateWarmShelfPagesBefore(
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[][] {
  return layoutWithConfig(sizes, CANDIDATE_WARM_SHELF_LAYOUT_BEFORE);
}

/** 追加調整 D（C ベース） */
export function layoutCandidateWarmShelfPagesD(
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[][] {
  return layoutWithConfig(sizes, CANDIDATE_WARM_SHELF_LAYOUT_D);
}

export function toCandidateWarmShelfPercent(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    left: `${(box.x / CANDIDATE_WARM_SHELF_BG.width) * 100}%`,
    top: `${(box.y / CANDIDATE_WARM_SHELF_BG.height) * 100}%`,
    width: `${(box.width / CANDIDATE_WARM_SHELF_BG.width) * 100}%`,
    height: `${(box.height / CANDIDATE_WARM_SHELF_BG.height) * 100}%`,
  };
}

export function isNearCandidateWarmShelfLed(placed: {
  x: number;
  width: number;
  bay: number;
}): boolean {
  const cx = placed.x + placed.width / 2;
  const nearX = Math.abs(cx - CANDIDATE_WARM_SHELF_LED_CENTER_X) < 100;
  return nearX && (placed.bay === 0 || placed.bay === 1 || placed.bay === 2);
}
