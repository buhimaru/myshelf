/**
 * 完成イメージ（1024×664）を実測した配置設計。
 * 背景 `shelf-background.png` と同座標系。画面幅変更時は % 写像で追従する。
 *
 * 奥行き（手前／奥）は影や z-index ではなく、棚板「上面」上の接地 Y で表現する。
 * 下向き気味の正面写真では:
 *   - 棚板上面の奥（背板寄り） = より小さい Y
 *   - 棚板上面の手前（前縁寄り） = より大きい Y（前縁ハイライト直前まで）
 */

export const SHELF_BG = {
  /** @deprecated 互換用。明示的には SHELF_BG_VARIANTS を使う */
  src: "/images/shelf-background-white-spines.png?v=white-locked",
  width: 1024,
  height: 664,
} as const;

/** 開発プレビュー専用の背景バリエーション（本番棚では使わない） */
export const SHELF_BG_VARIANTS = {
  white: {
    id: "white" as const,
    label: "白い背表紙（現行版）",
    src: "/images/shelf-background-white-spines.png?v=white-locked",
    width: 1024,
    height: 664,
  },
  navyBefore: {
    id: "navyBefore" as const,
    label: "ダークネイビー革（修正前・保存版）",
    src: "/images/shelf-background-navy-leather-before.png?v=navy-before",
    width: 1024,
    height: 664,
  },
  /** 旧採用（バックアップ。上書き禁止） */
  navy: {
    id: "navy" as const,
    label: "ダークネイビー革（旧採用・complete）",
    src: "/images/shelf-background-navy-leather-complete.png?v=navy-complete",
    width: 1024,
    height: 664,
  },
  /** 正式採用（新空棚＋新素材5冊）。本番 ImageShelf と同一 */
  navyNewbooks: {
    id: "navyNewbooks" as const,
    label: "ダークネイビー革（正式採用・新素材5冊）",
    src: "/images/shelf-background-navy-leather-newbooks.png?v=navy-newbooks",
    width: 1024,
    height: 664,
  },
  /**
   * 5冊目右側面の再構築プレビュー専用。
   * complete は上書きせず別名。本番 ImageShelf には未適用。
   */
  navyBook5SideV2: {
    id: "navyBook5SideV2" as const,
    label: "5冊目側面再構築 v2（プレビュー専用・未採用）",
    src: "/images/shelf-background-navy-leather-book5side-v2.png?v=book5side-v2",
    width: 1024,
    height: 664,
  },
  /** 側面+棚奥接合の v3。complete/v2 は保持。本番未適用 */
  navyBook5SideV3: {
    id: "navyBook5SideV3" as const,
    label: "5冊目側面・棚奥 v3（プレビュー専用・未採用）",
    src: "/images/shelf-background-navy-leather-book5side-v3.png?v=book5side-v3",
    width: 1024,
    height: 664,
  },
} as const;

export type ShelfBgVariantId = keyof typeof SHELF_BG_VARIANTS;

/** 比較用の完成イメージ（開発参照。本番棚では使わない） */
export const SHELF_CONCEPT = {
  src: "/images/ref/shelf-concept.jpg",
  width: 1024,
  height: 664,
} as const;

/** LED 中心 X（2段目右端作品の中心を合わせる） */
export const LED_CENTER_X = 810;

/**
 * 棚内 LED 近傍かどうか（2段目右端付近）。
 * 直下作品は右斜め影を弱める／省略する判定に使う。座標・サイズは変えない。
 */
export function isNearShelfLed(placed: {
  x: number;
  width: number;
  bay: number;
}): boolean {
  const cx = placed.x + placed.width / 2;
  const nearX = Math.abs(cx - LED_CENTER_X) < 100;
  // LED は主に2段目（bay 1）右寄り。上下段でも同 X は弱影にする
  return nearX && (placed.bay === 1 || placed.bay === 0 || placed.bay === 2);
}

/**
 * 各段の棚板上面バンド（実測）。
 * frontLipY = 前端ハイライト中心。sit は lip より手前（大きい Y）には出さない。
 */
export const SHELF_BOARD = [
  { backY: 145, frontLipY: 152 },
  { backY: 278, frontLipY: 289 },
  /** 3段目: 上面 ≈424–433、前縁ピーク 434 */
  { backY: 424, frontLipY: 434 },
  /** 4段目: 上面 ≈578–598、前縁ピーク 599。白背表紙下端 ≈596（手前） */
  { backY: 578, frontLipY: 599 },
] as const;

/**
 * 直前レイアウトのスナップショット（今回の4段目微調整の比較用）。
 * 実行時レイアウトには使わない。
 */
export const LAYOUT_BEFORE = {
  bays: [
    {
      bay: 0,
      size: 110,
      xs: [122, 280, 439, 597, 755] as const,
      sitY: 152,
    },
    {
      bay: 1,
      size: 110,
      xs: [122, 280, 439, 597, 755] as const,
      sitY: 286,
    },
    {
      bay: 2,
      size: 110,
      xs: [95, 231, 367, 504, 640] as const,
      sitY: 432,
    },
    {
      bay: 3,
      size: 128,
      xs: [228, 364, 500, 636, 772] as const,
      sitY: 580,
    },
  ],
} as const;

/**
 * 作品の見た目共通値。
 */
export const COVER_STYLE = {
  size: 110,
} as const;

export type BayLayout = {
  bay: number;
  xs: readonly [number, number, number, number, number];
  size?: number;
  /**
   * 棚板上面上の接地 Y（作品下端）。
   * 省略時は SHELF_BOARD[bay].frontLipY（前端すぐ手前は個別指定）。
   */
  sitY: number;
};

/**
 * 各段レイアウト
 * - 1〜3段: 確定値のまま（今回変更なし）
 * - 4段: 128→110、sit 580→584（数px手前。白背表紙下端~596・前縁599より奥を維持）
 */
export const BAY_LAYOUTS: readonly BayLayout[] = [
  {
    bay: 0,
    size: 110,
    sitY: 152,
    xs: [122, 280, 439, 597, 755],
  },
  {
    bay: 1,
    size: 110,
    sitY: 286,
    xs: [122, 280, 439, 597, 755],
  },
  {
    bay: 2,
    size: 110,
    // 手前: レコード下端(~430)に揃え、前縁ピーク(434)直前まで出す
    sitY: 432,
    xs: [95, 231, 367, 504, 640],
  },
  {
    bay: 3,
    size: 110,
    // ほんの少し手前へ。3段目より奥・めり込みなし（前縁599 / 白背表紙~596 より奥）
    sitY: 592,
    // 110px×5 + 間隔≈28。白背表紙右(~208)の右から自然に並べる
    xs: [228, 366, 504, 642, 780],
  },
] as const;

export type PlacedCover = {
  itemId: string;
  bay: number;
  slot: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sitY: number;
};

/** 完成イメージ比較用の参照ボックス（実測近似） */
export const CONCEPT_REF_BOXES: readonly Omit<PlacedCover, "itemId" | "sitY">[] =
  [
    { bay: 0, slot: 0, x: 117, y: 32, width: 130, height: 120 },
    { bay: 0, slot: 1, x: 270, y: 32, width: 127, height: 120 },
    { bay: 0, slot: 2, x: 432, y: 32, width: 132, height: 120 },
    { bay: 0, slot: 3, x: 600, y: 32, width: 128, height: 120 },
    { bay: 0, slot: 4, x: 762, y: 32, width: 128, height: 120 },
    { bay: 1, slot: 0, x: 120, y: 166, width: 125, height: 120 },
    { bay: 1, slot: 1, x: 273, y: 166, width: 125, height: 120 },
    { bay: 1, slot: 2, x: 433, y: 166, width: 119, height: 120 },
    { bay: 1, slot: 3, x: 587, y: 166, width: 126, height: 120 },
    { bay: 1, slot: 4, x: 749, y: 166, width: 134, height: 120 },
    { bay: 2, slot: 0, x: 85, y: 306, width: 118, height: 118 },
    { bay: 2, slot: 1, x: 219, y: 306, width: 114, height: 118 },
    { bay: 2, slot: 2, x: 353, y: 306, width: 113, height: 118 },
    { bay: 2, slot: 3, x: 492, y: 306, width: 115, height: 118 },
    { bay: 2, slot: 4, x: 632, y: 306, width: 120, height: 118 },
    { bay: 3, slot: 0, x: 244, y: 478, width: 117, height: 118 },
    { bay: 3, slot: 1, x: 384, y: 478, width: 122, height: 118 },
    { bay: 3, slot: 2, x: 527, y: 478, width: 114, height: 118 },
    { bay: 3, slot: 3, x: 664, y: 478, width: 117, height: 118 },
    { bay: 3, slot: 4, x: 810, y: 478, width: 122, height: 118 },
  ];

export function layoutDummyCovers(itemIds: readonly string[]): PlacedCover[] {
  const placed: PlacedCover[] = [];
  let cursor = 0;

  for (const layout of BAY_LAYOUTS) {
    const size = layout.size ?? COVER_STYLE.size;
    const sitY = layout.sitY;
    layout.xs.forEach((x, slot) => {
      const id = itemIds[cursor];
      if (!id) return;
      cursor += 1;
      placed.push({
        itemId: id,
        bay: layout.bay,
        slot,
        x,
        y: sitY - size,
        width: size,
        height: size,
        sitY,
      });
    });
  }

  return placed;
}

/** 段ごとの代表値（報告・比較用） */
export function summarizeBayLayouts() {
  return BAY_LAYOUTS.map((layout) => {
    const size = layout.size ?? COVER_STYLE.size;
    const before = LAYOUT_BEFORE.bays[layout.bay];
    const board = SHELF_BOARD[layout.bay];
    return {
      bay: layout.bay,
      board,
      before: {
        size: before.size,
        xs: [...before.xs],
        sitY: before.sitY,
        y: before.sitY - before.size,
        cxLast: before.xs[4] + before.size / 2,
      },
      after: {
        size,
        xs: [...layout.xs],
        sitY: layout.sitY,
        y: layout.sitY - size,
        cxLast: layout.xs[4] + size / 2,
      },
    };
  });
}

export function toPercent(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    left: `${(box.x / SHELF_BG.width) * 100}%`,
    top: `${(box.y / SHELF_BG.height) * 100}%`,
    width: `${(box.width / SHELF_BG.width) * 100}%`,
    height: `${(box.height / SHELF_BG.height) * 100}%`,
  };
}

export function formatBox(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}`;
}
