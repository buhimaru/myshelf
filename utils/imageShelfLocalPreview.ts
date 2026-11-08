/**
 * ローカル通常棚への候補プレビュー仮反映。
 * `.env.local` の NEXT_PUBLIC_SHELF_CANDIDATE_PREVIEW のみで切り替える。
 * 本番定数（imageShelfLayout.ts）・比較プレビュー候補ファイルは書き換えない。
 *
 * 戻し方: NEXT_PUBLIC_SHELF_CANDIDATE_PREVIEW を削除または空にして next dev を再起動。
 * 本 NO IMAGE 縦長だけ戻す: LOCAL_SHELF_D_BOOK_NO_IMAGE_PORTRAIT を false にする。
 */

import type { ImageShelfRenderSpec } from "../components/ImageShelf";
import { IMAGE_SHELF_COVER_SIZE } from "./imageShelfLayout";
import {
  CANDIDATE_WARM_SHELF_BG,
  isNearCandidateWarmShelfLed,
  layoutCandidateWarmShelfPagesD,
  toCandidateWarmShelfPercent,
} from "./imageShelfLayoutCandidateWarm";

const PREVIEW = process.env.NEXT_PUBLIC_SHELF_CANDIDATE_PREVIEW?.trim();

const SPEC_D: ImageShelfRenderSpec = {
  bg: CANDIDATE_WARM_SHELF_BG,
  layoutPages: layoutCandidateWarmShelfPagesD,
  toPercent: toCandidateWarmShelfPercent,
  isNearLed: isNearCandidateWarmShelfLed,
};

/**
 * 通常棚（ImageShelf）が renderSpec 未指定のときだけ使う。
 * 比較プレビュー側が明示指定した renderSpec は上書きしない。
 */
export function getLocalShelfPreviewRenderSpec():
  | ImageShelfRenderSpec
  | undefined {
  if (PREVIEW === "D") return SPEC_D;
  return undefined;
}

export const LOCAL_SHELF_CANDIDATE_PREVIEW =
  PREVIEW === "D" ? ("D" as const) : null;

/**
 * ローカル通常棚 D のみ: 本ジャンル NO IMAGE をゲームジャケット相当の縦長にする。
 * false にすると square（110×110）へ戻る。比較プレビュー・他ジャンルには効かない。
 */
export const LOCAL_SHELF_D_BOOK_NO_IMAGE_PORTRAIT = true;

/**
 * 高さは通常カバー枠と同じ、横は少し狭い（約 0.78）。
 * 旧文庫 1.5 倍縦長より控えめで、段内寸を超えにくい。
 */
export function localShelfDBookNoImageSize(): {
  width: number;
  height: number;
} {
  const height = IMAGE_SHELF_COVER_SIZE;
  const width = Math.round(height * 0.78);
  return { width, height };
}
