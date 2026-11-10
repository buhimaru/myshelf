/**
 * 新候補棚（狭い木目・1024×704）用の配置定数。
 * 暫定採用版（utils/imageShelfLayout.ts）とは完全に別系統。
 * 本番棚・既存定数は参照するだけで書き換えない。
 */

import type {
  ImageShelfPlacedBox,
  ImageShelfSize,
} from "./imageShelfLayout";

/** 候補背景（public へ別ファイル保存。採用画像は上書きしない） */
export const CANDIDATE_NARROW_SHELF_BG = {
  src: "/images/shelf-narrow-wood-candidate.jpg?v=narrow-wood-candidate",
  width: 1024,
  height: 704,
} as const;

/** 暫定採用と同じギャップ。横幅縮小に合わせた最小調整は領域側で行う */
export const CANDIDATE_NARROW_SHELF_GAP = 12;

/**
 * 新背景の実測に基づく段領域（初回寄せ）。
 * - 棚板上面: 約 174 / 320 / 475 / 650
 * - 内壁: 左 ~95–100、右 ~930
 * - レコード左縁 ~755、ネイビー本右縁 ~215
 */
export const CANDIDATE_NARROW_SHELF_ROWS = [
  { bay: 0, bottomY: 174, regionLeft: 100, regionRight: 930 },
  { bay: 1, bottomY: 320, regionLeft: 100, regionRight: 930 },
  { bay: 2, bottomY: 475, regionLeft: 100, regionRight: 755 },
  { bay: 3, bottomY: 650, regionLeft: 220, regionRight: 930 },
] as const;

/** LED は左寄り（暫定採用の右 LED とは別） */
export const CANDIDATE_NARROW_SHELF_LED_CENTER_X = 184;

/** 4段目の拡大率は暫定採用と同じ扱い */
export const CANDIDATE_NARROW_SHELF_BAY3_SIZE_SCALE = 1.05;

type CandidateRow = (typeof CANDIDATE_NARROW_SHELF_ROWS)[number];

function contentLeft(bay: number): number {
  return CANDIDATE_NARROW_SHELF_ROWS[bay]!.regionLeft + CANDIDATE_NARROW_SHELF_GAP;
}

function contentRight(bay: number): number {
  return (
    CANDIDATE_NARROW_SHELF_ROWS[bay]!.regionRight - CANDIDATE_NARROW_SHELF_GAP
  );
}

function sizeForBay(bay: number, size: ImageShelfSize): ImageShelfSize {
  if (bay !== 3) return size;
  return {
    width: size.width * CANDIDATE_NARROW_SHELF_BAY3_SIZE_SCALE,
    height: size.height * CANDIDATE_NARROW_SHELF_BAY3_SIZE_SCALE,
  };
}

function placeEvenRow(
  row: CandidateRow,
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
  row: CandidateRow,
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[] {
  let x = row.regionLeft + CANDIDATE_NARROW_SHELF_GAP;
  return sizes.map((size) => {
    const box: ImageShelfPlacedBox = {
      bay: row.bay,
      x,
      y: row.bottomY - size.height,
      width: size.width,
      height: size.height,
    };
    x += size.width + CANDIDATE_NARROW_SHELF_GAP;
    return box;
  });
}

/** 暫定採用と同じ等間隔／左詰めルール（候補の ROWS のみ使用） */
export function layoutCandidateNarrowShelfPages(
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[][] {
  const pages: ImageShelfPlacedBox[][] = [];
  let index = 0;
  while (index < sizes.length) {
    const pageStart = index;
    const filled: { row: CandidateRow; sizes: ImageShelfSize[] }[] = [];
    for (const row of CANDIDATE_NARROW_SHELF_ROWS) {
      if (index >= sizes.length) break;
      const left = contentLeft(row.bay);
      const right = contentRight(row.bay);
      let cursor = left;
      const rowSizes: ImageShelfSize[] = [];
      while (index < sizes.length) {
        const size = sizes[index];
        if (!size) break;
        const placed = sizeForBay(row.bay, size);
        if (cursor + placed.width > right + 0.001) break;
        rowSizes.push(placed);
        cursor += placed.width + CANDIDATE_NARROW_SHELF_GAP;
        index += 1;
      }
      if (rowSizes.length > 0) filled.push({ row, sizes: rowSizes });
    }
    if (index === pageStart) {
      const size = sizes[index];
      const row = CANDIDATE_NARROW_SHELF_ROWS[0];
      if (!size || !row) break;
      filled.push({ row, sizes: [size] });
      index += 1;
    }
    const page = filled.flatMap((entry, rowIndex) => {
      const finalized = rowIndex < filled.length - 1 || index < sizes.length;
      return finalized
        ? placeEvenRow(entry.row, entry.sizes)
        : placePackedRow(entry.row, entry.sizes);
    });
    pages.push(page);
  }
  return pages;
}

export function toCandidateNarrowShelfPercent(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    left: `${(box.x / CANDIDATE_NARROW_SHELF_BG.width) * 100}%`,
    top: `${(box.y / CANDIDATE_NARROW_SHELF_BG.height) * 100}%`,
    width: `${(box.width / CANDIDATE_NARROW_SHELF_BG.width) * 100}%`,
    height: `${(box.height / CANDIDATE_NARROW_SHELF_BG.height) * 100}%`,
  };
}

export function isNearCandidateNarrowShelfLed(placed: {
  x: number;
  width: number;
  bay: number;
}): boolean {
  const cx = placed.x + placed.width / 2;
  const nearX = Math.abs(cx - CANDIDATE_NARROW_SHELF_LED_CENTER_X) < 100;
  return nearX && (placed.bay === 0 || placed.bay === 1 || placed.bay === 2);
}
