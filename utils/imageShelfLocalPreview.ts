/**
 * 通常棚の採用素材（候補 D / 温もり木製レコード棚）。
 *
 * 以前は `.env.local` の NEXT_PUBLIC_SHELF_CANDIDATE_PREVIEW=D でのみローカル仮反映していた。
 * 正式にこの見た目を本番にも揃えるため、env なしでも SPEC_D を返す。
 * 比較プレビュー側が明示指定した renderSpec は ImageShelf 側で優先され、上書きしない。
 *
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
  return SPEC_D;
}

/** 採用棚 D。NO IMAGE 本の縦長など D 専用挙動の判定に使う */
export const LOCAL_SHELF_CANDIDATE_PREVIEW = "D" as const;

/**
 * 通常棚 D: 本ジャンル NO IMAGE をゲームジャケット相当の縦長にする。
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
