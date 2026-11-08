/**
 * 2段目を6枠にし、右端枠の表示中心をLEDに合わせる（プレビュー専用）。
 * 現行の均等配置B（layoutEven / EVEN_COUNTS.B）は変更しない。
 * 1・3・4段は同じ均等ルール。2段目が1枠減るので、3段目以降の作品は順に1つ繰り上がる。
 */

import {
  EVEN_BANDS,
  type PackedItem,
  type VisualSize,
  layoutEven,
} from "./intrinsicPackLayout";
import { LED_LUMINOUS_CENTER_X } from "./ledAnchorLayout";

/** 7-6-6-6。合計25冊 */
export const LED_RIGHT_COUNTS = [7, 6, 6, 6] as const;

const BAY1 = 1;
const ANCHOR_SLOT = 5;
/** これより狭い作品間は極端とみなし、縮小も移動もしない */
const MIN_GAP = 12;

export type LedRightRow = {
  slot: number;
  center: number;
  delta: number;
  gapToNext: number | null;
  anchored: boolean;
};

export type LedRightResult = {
  placed: PackedItem[];
  fits: boolean;
  reason: string | null;
  warning: string | null;
  rows: LedRightRow[];
  /** 左端から1枠目までの余白 */
  leftMargin: number | null;
  /** 6枠目の右端から使用可能帯の右端まで */
  rightMargin: number | null;
  /** 2段目の作品間（5箇所とも同じ） */
  gap: number | null;
  anchorCenter: number | null;
  anchorDelta: number | null;
};

function rowsFrom(items: PackedItem[], ledCenterX: number): LedRightRow[] {
  return items.map((item, slot) => {
    const center = item.x + item.width / 2;
    const next = items[slot + 1];
    return {
      slot,
      center,
      delta: center - ledCenterX,
      gapToNext: next ? next.x - (item.x + item.width) : null,
      anchored: slot === ANCHOR_SLOT,
    };
  });
}

function margins(items: PackedItem[]) {
  const band = EVEN_BANDS[BAY1];
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return { leftMargin: null, rightMargin: null };
  return {
    leftMargin: first.x - band.left,
    rightMargin: band.right - (last.x + last.width),
  };
}

/**
 * 1・3・4段は指定冊数の均等配置。
 * 2段目の6枠目だけ表示中心を LED に固定し、左の5枠は
 * 左余白 = 隙間の半分、作品間とアンカー直前は隙間1つ分で並べる。
 */
export function layoutLedRight(
  sizes: readonly VisualSize[],
  ledCenterX = LED_LUMINOUS_CENTER_X
): LedRightResult {
  const base = layoutEven(sizes, LED_RIGHT_COUNTS);
  const bayItems = base.placed.filter((item) => item.bay === BAY1);
  const band = EVEN_BANDS[BAY1];
  const unchanged = (reason: string): LedRightResult => {
    const edge = margins(bayItems);
    const anchor = bayItems[ANCHOR_SLOT];
    const anchorCenter = anchor ? anchor.x + anchor.width / 2 : null;
    return {
      placed: base.placed,
      fits: false,
      reason,
      warning: null,
      rows: rowsFrom(bayItems, ledCenterX),
      leftMargin: edge.leftMargin,
      rightMargin: edge.rightMargin,
      gap: base.metrics.find((row) => row.bay === BAY1)?.gap ?? null,
      anchorCenter,
      anchorDelta:
        anchorCenter == null ? null : anchorCenter - ledCenterX,
    };
  };

  const metric = base.metrics.find((row) => row.bay === BAY1);
  if (!metric?.fits || bayItems.length !== LED_RIGHT_COUNTS[BAY1]) {
    return unchanged(
      metric?.reason ??
        "2段目が6枠そろっていないため、LED固定は適用しない"
    );
  }

  const anchor = bayItems[ANCHOR_SLOT]!;
  const anchorX = ledCenterX - anchor.width / 2;
  const anchorRight = anchorX + anchor.width;
  if (anchorX < band.left - 0.05 || anchorRight > band.right + 0.05) {
    return unchanged(
      `6枠目（幅 ${anchor.width.toFixed(1)}px）を中心 ${ledCenterX} に置くと使用可能帯 ${band.left}–${band.right} を超えるため、移動しない`
    );
  }

  const leftItems = bayItems.slice(0, ANCHOR_SLOT);
  const space = anchorX - band.left;
  const widthSum = leftItems.reduce((sum, item) => sum + item.width, 0);
  const gap = (space - widthSum) / (leftItems.length + 0.5);
  if (gap < MIN_GAP) {
    return unchanged(
      `左5枠の隙間が ${gap.toFixed(1)}px になり、${MIN_GAP}px を下回るため縮小も移動もしていない`
    );
  }

  let cursor = band.left + gap / 2;
  const nextBay1: PackedItem[] = leftItems.map((item) => {
    const placed = { ...item, x: cursor, y: band.sitY - item.height };
    cursor += item.width + gap;
    return placed;
  });
  nextBay1.push({
    ...anchor,
    x: anchorX,
    y: band.sitY - anchor.height,
  });

  for (let slot = 1; slot < nextBay1.length; slot++) {
    const prev = nextBay1[slot - 1]!;
    const cur = nextBay1[slot]!;
    if (cur.x < prev.x + prev.width - 0.5) {
      return unchanged("6枠目と左の作品が重なるため、移動しない");
    }
  }

  const byIndex = new Map(nextBay1.map((item) => [item.index, item]));
  const placed = base.placed.map((item) => byIndex.get(item.index) ?? item);
  const edge = margins(nextBay1);
  const anchorCenter = anchorX + anchor.width / 2;

  return {
    placed,
    fits: true,
    reason: null,
    warning: null,
    rows: rowsFrom(nextBay1, ledCenterX),
    leftMargin: edge.leftMargin,
    rightMargin: edge.rightMargin,
    gap,
    anchorCenter,
    anchorDelta: anchorCenter - ledCenterX,
  };
}
