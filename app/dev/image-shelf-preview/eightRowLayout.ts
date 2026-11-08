/**
 * 1・2段目を8冊にした均等配置（プレビュー専用）。
 * LEDは見ない。実表示幅のまま、左右余白は間隔の半分。
 * 幅が足りない段は縮小・重ね・はみ出しをせず未配置にする。
 * 3・4段は現行の均等6冊。順番は変えない。
 */

import {
  EVEN_BANDS,
  type BayEvenMetrics,
  type EvenPackResult,
  type PackedItem,
  type VisualSize,
  layoutEven,
} from "./intrinsicPackLayout";

export const EIGHT_COUNTS = [8, 8, 6, 6] as const;

export type RowReport = {
  bay: number;
  count: number;
  placedCount: number;
  usable: number;
  widthSum: number;
  shortage: number;
  leftMargin: number | null;
  rightMargin: number | null;
  gap: number | null;
  gapMin: number | null;
  gapMax: number | null;
  widths: number[];
  overlap: boolean;
  fits: boolean;
  reason: string | null;
};

export function layoutEightRows(sizes: readonly VisualSize[]): EvenPackResult {
  return layoutEven(sizes, EIGHT_COUNTS);
}

/** 配置枠ではなく、置いたジャケット外形から余白・間隔・重なりを測る */
export function describeRows(
  placed: readonly PackedItem[],
  sizes: readonly VisualSize[],
  counts: readonly [number, number, number, number],
  fallback?: readonly BayEvenMetrics[]
): RowReport[] {
  let index = 0;
  return EVEN_BANDS.map((band) => {
    const count = counts[band.bay]!;
    const slice = sizes.slice(index, index + count);
    index += count;
    const usable = band.right - band.left;
    const widthSum = slice.reduce((sum, size) => sum + size.width, 0);
    const items = placed
      .filter((item) => item.bay === band.bay)
      .slice()
      .sort((a, b) => a.x - b.x);
    const widths = (items.length > 0 ? items : slice).map((item) => item.width);
    const gaps = items.slice(1).map((item, slot) => {
      const prev = items[slot]!;
      return item.x - (prev.x + prev.width);
    });
    const overlap = gaps.some((gap) => gap < -0.5);
    const metric = fallback?.find((row) => row.bay === band.bay);
    const fits =
      slice.length === count &&
      items.length === count &&
      !overlap &&
      widthSum <= usable + 0.05;
    const leftMargin =
      items.length > 0 ? items[0]!.x - band.left : null;
    const last = items[items.length - 1];
    const rightMargin =
      last != null ? band.right - (last.x + last.width) : null;
    const shortage = Math.max(0, widthSum - usable);
    let reason = metric?.reason ?? null;
    if (!fits && !reason) {
      if (slice.length < count) reason = `作品が ${count} 冊に足りない`;
      else if (shortage > 0.05) {
        reason = `必要幅 ${widthSum.toFixed(1)}px、使用可能幅 ${usable}px、不足 ${shortage.toFixed(1)}px`;
      } else if (overlap) reason = "作品が重なる";
      else reason = "この段は未配置";
    }
    return {
      bay: band.bay,
      count,
      placedCount: items.length,
      usable,
      widthSum,
      shortage,
      leftMargin,
      rightMargin,
      gap: gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : null,
      gapMin: gaps.length ? Math.min(...gaps) : null,
      gapMax: gaps.length ? Math.max(...gaps) : null,
      widths,
      overlap,
      fits,
      reason: fits ? null : reason,
    };
  });
}
