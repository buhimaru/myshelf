/**
 * 密配置プリセット（プレビュー専用・独立設定）。
 *
 * 本番 `utils/imageShelfLayout.ts` の 5列座標・サイズは一切変更しない。
 * 本ファイルのプリセットを本番 ImageShelf に適用しないこと。
 *
 * 調査メモ（1024×664・正式採用 newbooks 背景）:
 * - 固定ネイビー5冊: 概ね x≈80–197 → 4段目作品左端は ≥228 を維持
 * - 固定レコード左縁: ≈769 → 3段目作品右端は ≤750 を維持
 * - 1–2段の現行5列占有幅: 122–865（幅743）
 * - 110px のまま 8/9列は物理的に不可 → 新プリセットのみ枠サイズ縮小
 */

import { IMAGE_SHELF_BG } from "../../../utils/imageShelfLayout";

/** 既存5列（本番と同一値のスナップショット。上書き禁止・参照のみ） */
export const DENSE_REF_FIVE_BAYS = [
  { bay: 0, size: 110, sitY: 152, xs: [122, 280, 439, 597, 755] as const },
  { bay: 1, size: 110, sitY: 286, xs: [122, 280, 439, 597, 755] as const },
  { bay: 2, size: 110, sitY: 432, xs: [95, 231, 367, 504, 640] as const },
  { bay: 3, size: 110, sitY: 592, xs: [228, 366, 504, 642, 780] as const },
] as const;

/** 段ごとの安全な配置可能帯（固定装飾を避ける） */
export const DENSE_SAFE_BANDS = [
  {
    bay: 0,
    left: 122,
    right: 865,
    note: "1段: 現行5列と同じ内側帯",
  },
  {
    bay: 1,
    left: 122,
    right: 865,
    note: "2段: 同上（LEDは影調整のみ）",
  },
  {
    bay: 2,
    left: 95,
    right: 750,
    note: "3段: 右端は固定レコード左縁(~769)より手前",
  },
  {
    bay: 3,
    left: 228,
    right: 890,
    note: "4段: 左端はネイビー5冊右縁(~197)より右",
  },
] as const;

export type DenseBayLayout = {
  bay: number;
  size: number;
  sitY: number;
  xs: readonly number[];
};

export type DensePresetId = "five" | "eight" | "nine" | "seven";

export type DensePreset = {
  id: DensePresetId;
  label: string;
  summary: string;
  bays: readonly DenseBayLayout[];
  /** 1ページに並ぶ枠数（試作用。本番 PAGE_SIZE=20 は未変更） */
  pageSlotCount: number;
  bayCounts: readonly [number, number, number, number];
};

function evenlySpace(
  left: number,
  right: number,
  count: number,
  size: number
): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.round((left + right - size) / 2)];
  const span = right - left - size;
  const step = span / (count - 1);
  const xs: number[] = [];
  for (let i = 0; i < count; i++) {
    xs.push(Math.round(left + i * step));
  }
  // 右端が帯をはみ出さないよう最終調整
  const last = xs[xs.length - 1]!;
  if (last + size > right) {
    const shift = last + size - right;
    for (let i = 0; i < xs.length; i++) xs[i]! -= shift;
  }
  return xs;
}

function bay(
  bayIndex: number,
  size: number,
  sitY: number,
  left: number,
  right: number,
  count: number
): DenseBayLayout {
  return {
    bay: bayIndex,
    size,
    sitY,
    xs: evenlySpace(left, right, count, size),
  };
}

/**
 * 8列案: 全段8枠。
 * 1–2段 size85 / 3–4段 size74–75（狭い帯に合わせる）
 */
const PRESET_EIGHT_BAYS: readonly DenseBayLayout[] = [
  bay(0, 85, 152, 122, 865, 8),
  bay(1, 85, 286, 122, 865, 8),
  bay(2, 74, 432, 95, 750, 8),
  bay(3, 75, 592, 228, 890, 8),
];

/**
 * 9列案: 1–2段は9枠、3段はレコード回避で8枠、4段は9枠（size70・間隔やや詰める）。
 * size110の9列は不可。3段の9×≥70も幅不足のため8に減枠。
 */
const PRESET_NINE_BAYS: readonly DenseBayLayout[] = [
  bay(0, 75, 152, 122, 865, 9),
  bay(1, 75, 286, 122, 865, 9),
  bay(2, 74, 432, 95, 750, 8), // 減枠
  bay(3, 70, 592, 228, 890, 9),
];

/**
 * 代替7列案: より大きい枠で自然な密度（8/9が小さく感じる場合用）
 */
const PRESET_SEVEN_BAYS: readonly DenseBayLayout[] = [
  bay(0, 99, 152, 122, 865, 7),
  bay(1, 99, 286, 122, 865, 7),
  bay(2, 86, 432, 95, 750, 7),
  bay(3, 86, 592, 228, 890, 7),
];

function countsOf(bays: readonly DenseBayLayout[]): [number, number, number, number] {
  return [
    bays[0]!.xs.length,
    bays[1]!.xs.length,
    bays[2]!.xs.length,
    bays[3]!.xs.length,
  ];
}

function pageSlots(bays: readonly DenseBayLayout[]): number {
  return bays.reduce((n, b) => n + b.xs.length, 0);
}

export const DENSE_PRESETS: Record<DensePresetId, DensePreset> = {
  five: {
    id: "five",
    label: "A：既存5列 + contain 100%",
    summary: "本番と同じ座標・110px。表示だけ contain。",
    bays: DENSE_REF_FIVE_BAYS.map((b) => ({
      bay: b.bay,
      size: b.size,
      sitY: b.sitY,
      xs: [...b.xs],
    })),
    pageSlotCount: 20,
    bayCounts: [5, 5, 5, 5],
  },
  eight: {
    id: "eight",
    label: "B：新8列 + contain 100%",
    summary: "独立プリセット。1–2段85px×8、3段74px×8、4段75px×8。",
    bays: PRESET_EIGHT_BAYS,
    pageSlotCount: pageSlots(PRESET_EIGHT_BAYS),
    bayCounts: countsOf(PRESET_EIGHT_BAYS),
  },
  nine: {
    id: "nine",
    label: "C：新9列狙い + contain 100%",
    summary:
      "独立プリセット。1–2段75px×9、3段はレコード回避で8枠、4段70px×9。",
    bays: PRESET_NINE_BAYS,
    pageSlotCount: pageSlots(PRESET_NINE_BAYS),
    bayCounts: countsOf(PRESET_NINE_BAYS),
  },
  seven: {
    id: "seven",
    label: "D：代替7列 + contain 100%",
    summary: "枠が小さくなりすぎる場合の代替。1–2段99px×7、3–4段86px×7。",
    bays: PRESET_SEVEN_BAYS,
    pageSlotCount: pageSlots(PRESET_SEVEN_BAYS),
    bayCounts: countsOf(PRESET_SEVEN_BAYS),
  },
};

export type DenseSlot = {
  bay: number;
  slot: number;
  globalIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sitY: number;
};

export function denseSlotsForPreset(presetId: DensePresetId): DenseSlot[] {
  const preset = DENSE_PRESETS[presetId];
  const slots: DenseSlot[] = [];
  let globalIndex = 0;
  for (const layout of preset.bays) {
    layout.xs.forEach((x, slot) => {
      slots.push({
        bay: layout.bay,
        slot,
        globalIndex,
        x,
        y: layout.sitY - layout.size,
        width: layout.size,
        height: layout.size,
        sitY: layout.sitY,
      });
      globalIndex += 1;
    });
  }
  return slots;
}

export function denseToPercent(box: {
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

/** スロット右端が固定装飾帯と重ならないか（簡易検査） */
export function validateDensePreset(presetId: DensePresetId): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const preset = DENSE_PRESETS[presetId];
  for (const layout of preset.bays) {
    const band = DENSE_SAFE_BANDS[layout.bay]!;
    for (const x of layout.xs) {
      if (x < band.left - 0.5) {
        issues.push(
          `bay${layout.bay} x=${x} < safe left ${band.left}`
        );
      }
      if (x + layout.size > band.right + 0.5) {
        issues.push(
          `bay${layout.bay} right=${x + layout.size} > safe right ${band.right}`
        );
      }
    }
    // 隣接スロットの重なり
    for (let i = 1; i < layout.xs.length; i++) {
      const prev = layout.xs[i - 1]!;
      const cur = layout.xs[i]!;
      if (cur < prev + layout.size) {
        issues.push(
          `bay${layout.bay} overlap slot${i - 1}/${i}: ${prev}+${layout.size} > ${cur}`
        );
      }
    }
  }
  return { ok: issues.length === 0, issues };
}
