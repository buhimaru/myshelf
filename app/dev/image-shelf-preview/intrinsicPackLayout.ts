/**
 * 実表示幅の均等配置（プレビュー専用）。
 *
 * 本番の5列座標・枠サイズは変更しない。
 * 表示サイズは現行A案（110×110枠への contain）と同じ。
 * 各段の使用可能幅に、ジャケット外形同士の隙間が等しくなるよう配置する。
 * 左右余白は作品間の隙間の半分。
 */

import { IMAGE_SHELF_BG } from "../../../utils/imageShelfLayout";

/** A案の配置枠（正方形）。これより大きくしない */
export const A_SLOT_SIZE = 110;

export type EvenPresetId = "A" | "B" | "C";

export const EVEN_LABELS: Record<EvenPresetId, string> = {
  A: "A：現行5列（変更なし）",
  B: "B：均等配置 7-7-6-6（26冊）",
  C: "C：均等配置 6-6-6-6（24冊）",
};

/** 段ごとの冊数。B/Cとも表示サイズは同じで、冊数と余白だけが違う */
export const EVEN_COUNTS: Record<
  Exclude<EvenPresetId, "A">,
  readonly [number, number, number, number]
> = {
  B: [7, 7, 6, 6],
  C: [6, 6, 6, 6],
};

/**
 * 使用可能帯（1024px座標）。
 * 1・2段は棚の内側。3段はレコード左縁≈769の手前。4段はネイビー右縁≈197の右。
 */
export const EVEN_BANDS = [
  { bay: 0, left: 78, right: 946, sitY: 152, note: "棚の内側" },
  { bay: 1, left: 78, right: 946, sitY: 286, note: "棚の内側" },
  { bay: 2, left: 78, right: 748, sitY: 432, note: "レコードの左" },
  { bay: 3, left: 214, right: 946, sitY: 592, note: "ネイビー5冊の右" },
] as const;

/** A案5列（本番と同一） */
export const A_FIVE_XS = [
  [122, 280, 439, 597, 755],
  [122, 280, 439, 597, 755],
  [95, 231, 367, 504, 640],
  [228, 366, 504, 642, 780],
] as const;

export const A_SIT_Y = [152, 286, 432, 592] as const;

export type VisualSize = { width: number; height: number };

/** 現行A案の contain 実表示サイズ。110枠が上限。拡大・縦縮小はしない */
export function aVisualSize(
  naturalWidth: number,
  naturalHeight: number
): VisualSize {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: A_SLOT_SIZE, height: A_SLOT_SIZE };
  }
  const scale = Math.min(
    A_SLOT_SIZE / naturalWidth,
    A_SLOT_SIZE / naturalHeight
  );
  return {
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  };
}

export type PackedItem = {
  index: number;
  bay: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sitY: number;
};

export type BayEvenMetrics = {
  bay: number;
  count: number;
  usable: number;
  widthSum: number;
  gap: number;
  side: number;
  fits: boolean;
  reason: string | null;
};

export type EvenPackResult = {
  placed: PackedItem[];
  metrics: BayEvenMetrics[];
  overflow: number;
};

/**
 * 指定冊数を各段の使用可能幅へ均等配置する。
 * 残幅 = 使用可能幅 − 作品幅合計
 * 作品数 n に対し、隙間 g が n 個分（左右は g/2 が2つ、作品間は g が n−1 個）になる。
 * 残幅が負のときは縮小せず、その段は置かずに理由を返す。
 */
export function layoutEven(
  sizes: readonly VisualSize[],
  counts: readonly [number, number, number, number]
): EvenPackResult {
  const placed: PackedItem[] = [];
  const metrics: BayEvenMetrics[] = [];
  let index = 0;

  for (const band of EVEN_BANDS) {
    const count = counts[band.bay]!;
    const slice = sizes.slice(index, index + count);
    const usable = band.right - band.left;
    const widthSum = slice.reduce((sum, size) => sum + size.width, 0);
    const remaining = usable - widthSum;

    if (slice.length < count) {
      metrics.push({
        bay: band.bay,
        count: slice.length,
        usable,
        widthSum,
        gap: 0,
        side: 0,
        fits: false,
        reason: `作品が ${count} 冊に足りない`,
      });
      break;
    }

    if (remaining < -0.05) {
      metrics.push({
        bay: band.bay,
        count,
        usable,
        widthSum,
        gap: remaining / count,
        side: remaining / count / 2,
        fits: false,
        reason: `幅合計 ${widthSum.toFixed(1)}px が使用可能幅 ${usable}px を ${(widthSum - usable).toFixed(1)}px 超えるため、縮小せず未配置`,
      });
      index += count;
      continue;
    }

    const gap = remaining / count;
    const side = gap / 2;
    let cursor = band.left + side;
    for (let slot = 0; slot < count; slot++) {
      const size = slice[slot]!;
      placed.push({
        index,
        bay: band.bay,
        x: cursor,
        y: band.sitY - size.height,
        width: size.width,
        height: size.height,
        sitY: band.sitY,
      });
      cursor += size.width + gap;
      index += 1;
    }
    metrics.push({
      bay: band.bay,
      count,
      usable,
      widthSum,
      gap,
      side,
      fits: true,
      reason: null,
    });
  }

  return {
    placed,
    metrics,
    overflow: Math.max(0, sizes.length - index),
  };
}

export function packToPercent(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    left: `${(box.x / IMAGE_SHELF_BG.width) * 100}%`,
    top: `${(box.y / IMAGE_SHELF_BG.height) * 100}%`,
    width: `${(box.width / IMAGE_SHELF_BG.width) * 100}%`,
    height: `${(box.height / IMAGE_SHELF_BG.height) * 100}%`,
  };
}

/** 同じ段の外形隙間が揃っているか、装飾帯を超えていないかを検査 */
export function validateEven(result: EvenPackResult): string[] {
  const issues: string[] = [];
  for (const metric of result.metrics) {
    if (!metric.fits && metric.reason) issues.push(`${metric.bay + 1}段: ${metric.reason}`);
  }
  const byBay = new Map<number, PackedItem[]>();
  for (const item of result.placed) {
    const list = byBay.get(item.bay) ?? [];
    list.push(item);
    byBay.set(item.bay, list);
  }
  for (const band of EVEN_BANDS) {
    const items = byBay.get(band.bay) ?? [];
    const metric = result.metrics.find((row) => row.bay === band.bay);
    for (const item of items) {
      if (item.x < band.left - 0.6) {
        issues.push(`${band.bay + 1}段が左限より外`);
      }
      if (item.x + item.width > band.right + 0.6) {
        issues.push(`${band.bay + 1}段が右限より外`);
      }
      if (Math.abs(item.y + item.height - band.sitY) > 0.6) {
        issues.push(`${band.bay + 1}段の下端が棚板と不一致`);
      }
    }
    if (!metric) continue;
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!;
      const cur = items[i]!;
      const space = cur.x - (prev.x + prev.width);
      if (Math.abs(space - metric.gap) > 0.75) {
        issues.push(
          `${band.bay + 1}段の隙間が不均一 (${space.toFixed(1)} / ${metric.gap.toFixed(1)})`
        );
      }
      if (cur.x < prev.x + prev.width - 0.5) {
        issues.push(`${band.bay + 1}段で作品が重なっている`);
      }
    }
    if (items.length > 0 && metric.fits) {
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const leftSpace = first.x - band.left;
      const rightSpace = band.right - (last.x + last.width);
      if (Math.abs(leftSpace - metric.side) > 0.75) {
        issues.push(`${band.bay + 1}段の左余白が指定と違う`);
      }
      if (Math.abs(rightSpace - metric.side) > 0.75) {
        issues.push(`${band.bay + 1}段の右余白が指定と違う`);
      }
    }
  }
  return issues;
}
