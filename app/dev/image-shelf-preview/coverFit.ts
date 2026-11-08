/**
 * 表紙フィット比較（プレビュー専用）。
 * 本番 ImageShelf の表示方式には未適用。
 */

export type CoverFitMode = "A" | "B" | "C" | "D" | "E";

export const COVER_FIT_MODES: readonly CoverFitMode[] = [
  "A",
  "B",
  "C",
  "D",
  "E",
] as const;

export const COVER_FIT_LABELS: Record<CoverFitMode, string> = {
  A: "A：現行（cover・変更なし）",
  B: "B：contain 100%",
  C: "C：contain 95%",
  D: "D：contain 90%",
  E: "E：contain 85%",
};

/** 画像本体のみの縮小率。配置枠は変更しない。A は cover のため未使用 */
export const COVER_FIT_SCALE: Record<CoverFitMode, number> = {
  A: 1,
  B: 1,
  C: 0.95,
  D: 0.9,
  E: 0.85,
};

export function isContainFitMode(mode: CoverFitMode): boolean {
  return mode !== "A";
}

/** 下端基準でスロット内に収まる表示サイズ（px）を算出 */
export function fitImageBox(
  naturalWidth: number,
  naturalHeight: number,
  slotWidth: number,
  slotHeight: number,
  scale: number
): { width: number; height: number } {
  const maxW = Math.max(1, slotWidth * scale);
  const maxH = Math.max(1, slotHeight * scale);
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxW, height: maxH };
  }
  const ar = naturalWidth / naturalHeight;
  let width = maxW;
  let height = width / ar;
  if (height > maxH) {
    height = maxH;
    width = height * ar;
  }
  return { width, height };
}
