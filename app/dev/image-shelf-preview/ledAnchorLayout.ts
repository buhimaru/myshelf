/**
 * 2段目のLED直下アンカー（プレビュー専用）。
 * 現行の均等配置B（layoutEven）は変更しない。ここから結果をコピーして2段目だけ組み直す。
 */

import {
  EVEN_BANDS,
  EVEN_COUNTS,
  type PackedItem,
  type VisualSize,
  layoutEven,
} from "./intrinsicPackLayout";

/**
 * 棚背景1024pxでのLED発光部の水平中心。
 * y=169–171、輝度200超の左右端の中点が 810 / 811 / 811。採用値は 811。
 */
export const LED_LUMINOUS_CENTER_X = 811;

const BAY1 = 1;

export type LedGapRow = {
  slot: number;
  center: number;
  delta: number;
  /** 右隣の外形までの隙間。右端は null */
  gapToNext: number | null;
  anchored: boolean;
};

export type LedAnchorResult = {
  placed: PackedItem[];
  /** 0始まり。均等配置BでLEDに最も近い枠 */
  anchorSlot: number;
  fits: boolean;
  reason: string | null;
  /** 画面に出している2段目 */
  rows: LedGapRow[];
  /** アンカーを置いた場合の試算。不採用のときだけ rows と異なる */
  proposal: LedGapRow[] | null;
  leftGap: number | null;
  rightGap: number | null;
  /** 配置はしたが、左右の隙間差が大きい */
  gapWarning: string | null;
};

function itemCenter(item: PackedItem): number {
  return item.x + item.width / 2;
}

function rowsFrom(items: PackedItem[], anchorSlot: number): LedGapRow[] {
  return items.map((item, slot) => {
    const next = items[slot + 1];
    return {
      slot,
      center: itemCenter(item),
      delta: itemCenter(item) - LED_LUMINOUS_CENTER_X,
      gapToNext: next ? next.x - (item.x + item.width) : null,
      anchored: slot === anchorSlot,
    };
  });
}

function closestSlot(items: PackedItem[]): number {
  let best = 0;
  let bestDist = Infinity;
  items.forEach((item, slot) => {
    const dist = Math.abs(itemCenter(item) - LED_LUMINOUS_CENTER_X);
    if (dist < bestDist) {
      best = slot;
      bestDist = dist;
    }
  });
  return best;
}

/**
 * 左右の領域へ、外側余白＝隙間の半分、アンカーとの間＝隙間1つ分で並べる。
 * 入らないときは座標を返さない。
 */
function placeGroup(
  items: PackedItem[],
  regionLeft: number,
  regionRight: number,
  side: "left" | "right"
): { gap: number; xs: number[] } | null {
  const count = items.length;
  if (count === 0) return { gap: 0, xs: [] };
  const widthSum = items.reduce((sum, item) => sum + item.width, 0);
  const space = regionRight - regionLeft;
  const gap = (space - widthSum) / (count + 0.5);
  if (gap < -0.05) return null;
  const xs: number[] = [];
  let cursor = side === "left" ? regionLeft + gap / 2 : regionLeft + gap;
  for (const item of items) {
    xs.push(cursor);
    cursor += item.width + gap;
  }
  return { gap, xs };
}

/** 均等配置Bを基に、2段目の1枠だけLED中心へ合わせる。他段はそのまま。 */
export function layoutLedAnchor(sizes: readonly VisualSize[]): LedAnchorResult {
  const base = layoutEven(sizes, EVEN_COUNTS.B);
  const bayItems = base.placed.filter((item) => item.bay === BAY1);
  const anchorSlot = bayItems.length > 0 ? closestSlot(bayItems) : 0;
  const unchanged = (): LedAnchorResult => ({
    placed: base.placed,
    anchorSlot,
    fits: false,
    reason: null,
    rows: rowsFrom(bayItems, anchorSlot),
    proposal: null,
    leftGap: null,
    rightGap: null,
    gapWarning: null,
  });

  const bayMetric = base.metrics.find((row) => row.bay === BAY1);
  if (!bayMetric?.fits || bayItems.length !== 7) {
    const result = unchanged();
    result.reason =
      bayMetric?.reason ?? "2段目の均等配置Bが7枠そろっていないため、アンカーは適用しない";
    return result;
  }

  const band = EVEN_BANDS[BAY1];
  const anchor = bayItems[anchorSlot]!;
  const anchorX = LED_LUMINOUS_CENTER_X - anchor.width / 2;
  const anchorRight = anchorX + anchor.width;
  if (anchorX < band.left - 0.05 || anchorRight > band.right + 0.05) {
    const result = unchanged();
    result.reason = `アンカー枠（幅 ${anchor.width.toFixed(1)}px）を中心 ${LED_LUMINOUS_CENTER_X} に置くと使用可能帯 ${band.left}–${band.right} を超えるため、移動しない`;
    return result;
  }

  const left = placeGroup(bayItems.slice(0, anchorSlot), band.left, anchorX, "left");
  const right = placeGroup(bayItems.slice(anchorSlot + 1), anchorRight, band.right, "right");
  if (!left || !right) {
    const result = unchanged();
    const leftSpace = anchorX - band.left;
    const rightSpace = band.right - anchorRight;
    result.reason = `左右に7枠のまま入らない（左の空き ${leftSpace.toFixed(1)}px / 右の空き ${rightSpace.toFixed(1)}px）。縮小せず現行Bの座標を維持`;
    return result;
  }

  const nextBay1: PackedItem[] = bayItems.map((item, slot) => {
    let x = anchorX;
    if (slot < anchorSlot) x = left.xs[slot]!;
    if (slot > anchorSlot) x = right.xs[slot - anchorSlot - 1]!;
    return {
      ...item,
      x,
      y: band.sitY - item.height,
    };
  });

  for (let slot = 1; slot < nextBay1.length; slot++) {
    const prev = nextBay1[slot - 1]!;
    const cur = nextBay1[slot]!;
    if (cur.x < prev.x + prev.width - 0.5) {
      const result = unchanged();
      result.reason = "アンカー後に作品が重なるため、移動しない";
      result.proposal = rowsFrom(nextBay1, anchorSlot);
      return result;
    }
  }

  const proposal = rowsFrom(nextBay1, anchorSlot);
  const gaps = proposal
    .map((row) => row.gapToNext)
    .filter((gap): gap is number => gap != null);
  const minGap = Math.min(...gaps);
  const maxGap = Math.max(...gaps);
  const uneven = minGap < 12 || (maxGap > 0 && minGap / maxGap < 0.5);
  const byIndex = new Map(nextBay1.map((item) => [item.index, item]));
  const placed = base.placed.map((item) => byIndex.get(item.index) ?? item);

  return {
    placed,
    anchorSlot,
    fits: true,
    reason: null,
    rows: proposal,
    proposal: null,
    leftGap: bayItems.slice(0, anchorSlot).length > 0 ? left.gap : null,
    rightGap: bayItems.slice(anchorSlot + 1).length > 0 ? right.gap : null,
    gapWarning: uneven
      ? `${anchorSlot + 1}枠目をLED中心に合わせていますが、作品間の隙間は ${minGap.toFixed(1)}–${maxGap.toFixed(1)}px で左右の差が大きくなっています。`
      : null,
  };
}

export function evenRowsForBay1(sizes: readonly VisualSize[]): LedGapRow[] {
  const base = layoutEven(sizes, EVEN_COUNTS.B);
  const bayItems = base.placed.filter((item) => item.bay === BAY1);
  const anchorSlot = bayItems.length > 0 ? closestSlot(bayItems) : 0;
  return rowsFrom(bayItems, anchorSlot);
}
