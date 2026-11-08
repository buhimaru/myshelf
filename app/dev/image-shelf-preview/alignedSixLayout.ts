/**
 * 6-6-6-6（24冊）のプレビュー配置。
 * 2段目は既存のLED直下固定（6枠目の表示中心 = 811）。
 * 1段目も同じルールで置く。右端の中心は揃い、幅が違うぶん輪郭の端はずれる。
 * 3・4段は従来の均等配置。
 * 背景・LEDは変更しない。
 */

import {
  EVEN_BANDS,
  type PackedItem,
  type VisualSize,
  layoutEven,
} from "./intrinsicPackLayout";
import { LED_LUMINOUS_CENTER_X } from "./ledAnchorLayout";

export const ALIGNED_COUNTS = [6, 6, 6, 6] as const;

const ANCHOR_SLOT = 5;
const MIN_GAP = 12;

export type SlotEdge = {
  slot: number;
  left: number;
  center: number;
  right: number;
  width: number;
  gapToNext: number | null;
  ledDelta: number;
};

export type AlignedSixResult = {
  placed: PackedItem[];
  fits: boolean;
  /** 1段目を2段目の中心列に乗せられた */
  sharedCenters: boolean;
  reason: string | null;
  bay0: SlotEdge[];
  bay1: SlotEdge[];
};

function edgesOf(items: PackedItem[]): SlotEdge[] {
  return items.map((item, slot) => {
    const next = items[slot + 1];
    const center = item.x + item.width / 2;
    return {
      slot,
      left: item.x,
      center,
      right: item.x + item.width,
      width: item.width,
      gapToNext: next ? next.x - (item.x + item.width) : null,
      ledDelta: center - LED_LUMINOUS_CENTER_X,
    };
  });
}

function gapProblem(items: PackedItem[], band: (typeof EVEN_BANDS)[number]): string | null {
  for (const item of items) {
    if (item.x < band.left - 0.5) return "左の使用可能帯を超える";
    if (item.x + item.width > band.right + 0.5) return "右の使用可能帯を超える";
  }
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!;
    const cur = items[i]!;
    const gap = cur.x - (prev.x + prev.width);
    if (gap < -0.5) return "作品が重なる";
    if (gap < MIN_GAP) return `作品間隔が ${gap.toFixed(1)}px まで狭くなる`;
  }
  return null;
}

/** 6枠目の中心をLEDに固定し、左5枠は左余白＝間隔の半分で均等に置く */
function anchorRow(
  items: PackedItem[],
  band: (typeof EVEN_BANDS)[number]
): { items: PackedItem[]; gap: number } | { error: string } {
  if (items.length !== 6) return { error: "6枠そろっていない" };
  const anchor = items[ANCHOR_SLOT]!;
  const anchorX = LED_LUMINOUS_CENTER_X - anchor.width / 2;
  if (anchorX < band.left - 0.05 || anchorX + anchor.width > band.right + 0.05) {
    return { error: "LED中心に置くと使用可能帯を超える" };
  }
  const leftItems = items.slice(0, ANCHOR_SLOT);
  const space = anchorX - band.left;
  const widthSum = leftItems.reduce((sum, item) => sum + item.width, 0);
  const gap = (space - widthSum) / (leftItems.length + 0.5);
  if (gap < MIN_GAP) {
    return { error: `左5枠の間隔が ${gap.toFixed(1)}px になり ${MIN_GAP}px を下回る` };
  }
  let cursor = band.left + gap / 2;
  const placed = leftItems.map((item) => {
    const next = { ...item, x: cursor, y: band.sitY - item.height };
    cursor += item.width + gap;
    return next;
  });
  placed.push({ ...anchor, x: anchorX, y: band.sitY - anchor.height });
  const problem = gapProblem(placed, band);
  if (problem) return { error: problem };
  return { items: placed, gap };
}

export function layoutAlignedSix(sizes: readonly VisualSize[]): AlignedSixResult {
  const base = layoutEven(sizes, ALIGNED_COUNTS);
  const bay0 = base.placed.filter((item) => item.bay === 0);
  const bay1 = base.placed.filter((item) => item.bay === 1);
  const empty = (reason: string): AlignedSixResult => ({
    placed: base.placed,
    fits: false,
    sharedCenters: false,
    reason,
    bay0: edgesOf(bay0),
    bay1: edgesOf(bay1),
  });

  if (bay0.length !== 6 || bay1.length !== 6) {
    return empty("6-6-6-6 の冊数がそろっていないため、中心合わせは適用しない");
  }

  const anchored = anchorRow(bay1, EVEN_BANDS[1]);
  if ("error" in anchored) {
    return empty(`2段目をLED中心に置けない（${anchored.error}）。縮小せず均等配置のまま`);
  }

  const top = anchorRow(bay0, EVEN_BANDS[0]);
  if ("error" in top) {
    const byIndex = new Map(anchored.items.map((item) => [item.index, item]));
    return {
      placed: base.placed.map((item) => byIndex.get(item.index) ?? item),
      fits: false,
      sharedCenters: false,
      reason: `1段目をLED中心に置けない（${top.error}）。縮小せず1段目は均等配置のまま`,
      bay0: edgesOf(bay0),
      bay1: edgesOf(anchored.items),
    };
  }
  const bay0Placed = top.items;
  const sharedCenters = true;
  const reason = null;

  const byIndex = new Map(
    [...bay0Placed, ...anchored.items].map((item) => [item.index, item])
  );
  const placed = base.placed.map((item) => byIndex.get(item.index) ?? item);

  return {
    placed,
    fits: true,
    sharedCenters,
    reason,
    bay0: edgesOf(bay0Placed),
    bay1: edgesOf(anchored.items),
  };
}
