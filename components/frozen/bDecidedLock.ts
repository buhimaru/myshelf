/**
 * =============================================================================
 * SVG暫定決定版ロック（FROZEN）
 * =============================================================================
 * このファイルの定数は「変更前（暫定決定版）」の復元用です。
 * 接合実験・画像素材実験で上書きしないでください。
 *
 * 表示URL: /dev/svg-shelf-b-decided
 * 対応プレビュー切替: /dev/svg-shelf-preview → B寸法再現 →「変更前（暫定決定版）」
 * =============================================================================
 */

/** 棚外寸（SVG viewBox） */
export const B_DECIDED_SHELF = {
  viewWidth: 479,
  viewHeight: 369,
  ratio: 479 / 369,
} as const;

/** 作品サイズ（1Q84基準） */
export const B_DECIDED_WORK_SIZE = {
  width: 58,
  height: 67,
} as const;

/**
 * 暫定決定の作品前後位置（接地 inset）。
 * trialBay3 適用後の実測相当: 1.49 / 1.20 / 1.92 / 5.12
 */
export const B_DECIDED_INSETS = [1.49, 1.2, 1.92, 5.12] as const;

/** 手前補正プロファイルキー（SvgShelfBLayoutVerify.FORWARD_NUDGE_BY_BAY） */
export const B_DECIDED_FORWARD_NUDGE_KEY = "trialBay3" as const;

/** 接地モード・上面プロファイル */
export const B_DECIDED_GROUNDING = "recess" as const;
export const B_DECIDED_DECK_PROFILE = "refB" as const;

/** 接合ディテールなし（突き当て） */
export const B_DECIDED_JOINT_SHADE = null;

export const B_DECIDED_LABEL =
  "SVG暫定決定版 — 479×369 / 作品58×67 / inset 1.49·1.20·1.92·5.12 / 接合ディテールなし";
