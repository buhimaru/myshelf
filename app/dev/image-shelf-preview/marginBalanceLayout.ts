/**
 * 6-6-6-6 の左右余白比較（プレビュー専用）。
 * A は現行の LED 完全一致。B/C は作品群を段ごとに水平移動するだけ。
 * 間隔・幅・高さ・3/4段・背景は変えない。
 */

import { EVEN_BANDS, type PackedItem, type VisualSize } from "./intrinsicPackLayout";
import { LED_LUMINOUS_CENTER_X } from "./ledAnchorLayout";
import { layoutAlignedSix } from "./alignedSixLayout";

/** 6枠目の表示中心が LED からずれてよい上限 */
export const LED_DRIFT_LIMIT = 25;

export type MarginBay = {
  bay: number;
  /** 左の使用可能端から、先頭ジャケット左端まで */
  leftMargin: number;
  /** 末尾ジャケット右端から、右の使用可能端まで */
  rightMargin: number;
  /** 右余白 − 左余白。正なら右が広い */
  marginDiff: number;
  /** 作品間の外形隙間。段内では一定 */
  gap: number;
  anchorCenter: number;
  ledDelta: number;
  /** 現行Aからの水平移動。右が正 */
  shift: number;
};

export type MarginPlan = {
  id: "A" | "B" | "C";
  label: string;
  placed: PackedItem[];
  fits: boolean;
  reason: string | null;
  bays: MarginBay[];
};

function rowMetrics(items: PackedItem[], shift: number): MarginBay | null {
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return null;
  const band = EVEN_BANDS[first.bay]!;
  const gaps: number[] = [];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!;
    const cur = items[i]!;
    gaps.push(cur.x - (prev.x + prev.width));
  }
  const gap = gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : 0;
  const leftMargin = first.x - band.left;
  const rightMargin = band.right - (last.x + last.width);
  const anchorCenter = last.x + last.width / 2;
  return {
    bay: first.bay,
    leftMargin,
    rightMargin,
    marginDiff: rightMargin - leftMargin,
    gap,
    anchorCenter,
    ledDelta: anchorCenter - LED_LUMINOUS_CENTER_X,
    shift,
  };
}

/** 左右の外形余白が等しくなる移動量。右が広ければ正 */
function equalizingShift(items: PackedItem[]): number {
  const metrics = rowMetrics(items, 0);
  if (!metrics) return 0;
  return metrics.marginDiff / 2;
}

function fitsBand(items: PackedItem[]): boolean {
  const band = EVEN_BANDS[items[0]?.bay ?? 0];
  if (!band) return false;
  return items.every(
    (item) => item.x >= band.left - 0.5 && item.x + item.width <= band.right + 0.5
  );
}

function applyShifts(
  base: PackedItem[],
  shifts: readonly [number, number],
  id: MarginPlan["id"],
  label: string
): MarginPlan {
  const next = base.map((item) => {
    if (item.bay === 0) return { ...item, x: item.x + shifts[0] };
    if (item.bay === 1) return { ...item, x: item.x + shifts[1] };
    return item;
  });
  const bay0 = next.filter((item) => item.bay === 0);
  const bay1 = next.filter((item) => item.bay === 1);
  const inside = fitsBand(bay0) && fitsBand(bay1);
  const shown0 = inside ? bay0 : base.filter((item) => item.bay === 0);
  const shown1 = inside ? bay1 : base.filter((item) => item.bay === 1);
  const shownShift: readonly [number, number] = inside ? shifts : [0, 0];
  return {
    id,
    label,
    placed: inside ? next : base,
    fits: inside,
    reason: inside ? null : "左右を揃える移動が使用可能帯を超えるため、現行位置のまま",
    bays: [rowMetrics(shown0, shownShift[0]), rowMetrics(shown1, shownShift[1])].filter(
      (row): row is MarginBay => row != null
    ),
  };
}

export function layoutMarginPlans(sizes: readonly VisualSize[]): MarginPlan[] {
  const aligned = layoutAlignedSix(sizes);
  const bay0 = aligned.placed.filter((item) => item.bay === 0);
  const bay1 = aligned.placed.filter((item) => item.bay === 1);
  const equal: [number, number] = [equalizingShift(bay0), equalizingShift(bay1)];
  const clamped: [number, number] = [
    Math.max(-LED_DRIFT_LIMIT, Math.min(LED_DRIFT_LIMIT, equal[0])),
    Math.max(-LED_DRIFT_LIMIT, Math.min(LED_DRIFT_LIMIT, equal[1])),
  ];
  return [
    applyShifts(aligned.placed, [0, 0], "A", "A：LED完全一致"),
    applyShifts(aligned.placed, equal, "B", "B：左右余白を均等"),
    applyShifts(aligned.placed, clamped, "C", "C：LEDずれ25px以内"),
  ];
}

