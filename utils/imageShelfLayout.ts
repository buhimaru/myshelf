/**
 * 画像背景棚（本番）の配置定数。
 * 背景と下端は固定する。段の冊数は表示幅に応じて変わる。
 */

/**
 * ローカル試作用フラグ。
 * `.env.local` に `NEXT_PUBLIC_SHELF_BG_TEST=1` があるときだけテスト背景を使う。
 * 本番採用画像・配置座標はこのフラグでは変更しない。
 */
const USE_SHELF_BG_TEST =
  process.env.NEXT_PUBLIC_SHELF_BG_TEST === "1";

/** 正式採用背景。上書き・削除禁止。 */
export const IMAGE_SHELF_BG_PRODUCTION = {
  src: "/images/shelf-background-navy-leather-newbooks.png?v=navy-newbooks",
  width: 1024,
  height: 664,
} as const;

/** ローカル試作背景。採用画像とは別ファイル（上書きしない）。 */
export const IMAGE_SHELF_BG_TEST = {
  src: "/images/shelf-left-led-hd-v3-test.jpg?v=left-led-hd-v3",
  width: 1024,
  height: 664,
} as const;

export const IMAGE_SHELF_BG = USE_SHELF_BG_TEST
  ? IMAGE_SHELF_BG_TEST
  : IMAGE_SHELF_BG_PRODUCTION;

/**
 * 旧5列ヘルパーが参照するページ幅。
 * 本番の画像棚は冊数固定で分割しない。
 */
export const IMAGE_SHELF_PAGE_SIZE = 25;

/** LED 発光部の中心 X。影の近傍判定に使う */
export const IMAGE_SHELF_LED_CENTER_X = 810;

/**
 * 作品間と、棚・固定装飾からの外側余白。全段共通。
 * 背景の実測に対して 12px あれば、隣とも装飾とも重ならない。
 */
export const IMAGE_SHELF_GAP = 12;

/**
 * 段の利用可能領域と下端。座標は背景 1024px。
 * content は領域の内側へ GAP だけ入れた、作品を置ける範囲。
 *
 * 実測（採用背景）:
 * - 棚の内側は 78–946
 * - LED本体は棚板の溝。y=168–172、x=754–867。高さ110pxの表紙上端は y=176 で、本体とは重ならない
 * - 本体より下の光は、表紙を照らす範囲として配置を妨げない
 * - レコードの左端は 766
 * - ネイビー5冊の右端は 195
 */
export const IMAGE_SHELF_ROWS = [
  { bay: 0, bottomY: 152, regionLeft: 78, regionRight: 946 },
  { bay: 1, bottomY: 286, regionLeft: 78, regionRight: 946 },
  { bay: 2, bottomY: 432, regionLeft: 78, regionRight: 766 },
  { bay: 3, bottomY: 592, regionLeft: 195, regionRight: 946 },
] as const;

/** LED本体。光の広がりは含まない */
export const IMAGE_SHELF_LED_BODY = {
  left: 754,
  right: 867,
  top: 168,
  bottom: 172,
} as const;

export function imageShelfContentLeft(bay: number): number {
  return IMAGE_SHELF_ROWS[bay]!.regionLeft + IMAGE_SHELF_GAP;
}

export function imageShelfContentRight(bay: number): number {
  return IMAGE_SHELF_ROWS[bay]!.regionRight - IMAGE_SHELF_GAP;
}

export type ImageShelfPlacedBox = {
  bay: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageShelfSize = {
  width: number;
  height: number;
};

type ImageShelfRow = (typeof IMAGE_SHELF_ROWS)[number];

/** 次の作品が入りきらず確定した段。左右端と作品間を同じ G にする。 */
function placeEvenRow(
  row: ImageShelfRow,
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[] {
  const span = row.regionRight - row.regionLeft;
  const widthSum = sizes.reduce((sum, size) => sum + size.width, 0);
  const gap = (span - widthSum) / (sizes.length + 1);
  let x = row.regionLeft + gap;
  return sizes.map((size) => {
    const box: ImageShelfPlacedBox = {
      bay: row.bay,
      x,
      y: row.bottomY - size.height,
      width: size.width,
      height: size.height,
    };
    x += size.width + gap;
    return box;
  });
}

/** まだ次の作品が無く、段が確定していないときの左詰め。 */
function placePackedRow(
  row: ImageShelfRow,
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[] {
  let x = row.regionLeft + IMAGE_SHELF_GAP;
  return sizes.map((size) => {
    const box: ImageShelfPlacedBox = {
      bay: row.bay,
      x,
      y: row.bottomY - size.height,
      width: size.width,
      height: size.height,
    };
    x += size.width + IMAGE_SHELF_GAP;
    return box;
  });
}

/**
 * 登録順のまま置く。段の冊数は 12px 間隔で決め、
 * 次の作品が入らず確定した段だけ、余白を左右端と作品間で等分する。
 * 作品が尽きた最終段は左詰め 12px のままにする。
 */
export function layoutImageShelfPages(
  sizes: readonly ImageShelfSize[]
): ImageShelfPlacedBox[][] {
  const pages: ImageShelfPlacedBox[][] = [];
  let index = 0;
  while (index < sizes.length) {
    const pageStart = index;
    const filled: { row: ImageShelfRow; sizes: ImageShelfSize[] }[] = [];
    for (const row of IMAGE_SHELF_ROWS) {
      if (index >= sizes.length) break;
      const contentLeft = imageShelfContentLeft(row.bay);
      const contentRight = imageShelfContentRight(row.bay);
      let cursor = contentLeft;
      const rowSizes: ImageShelfSize[] = [];
      while (index < sizes.length) {
        const size = sizes[index];
        if (!size) break;
        const placed = sizeForBay(row.bay, size);
        if (cursor + placed.width > contentRight + 0.001) break;
        rowSizes.push(placed);
        cursor += placed.width + IMAGE_SHELF_GAP;
        index += 1;
      }
      if (rowSizes.length > 0) filled.push({ row, sizes: rowSizes });
    }
    if (index === pageStart) {
      const size = sizes[index];
      const row = IMAGE_SHELF_ROWS[0];
      if (!size || !row) break;
      filled.push({ row, sizes: [size] });
      index += 1;
    }
    const page = filled.flatMap((entry, rowIndex) => {
      const finalized = rowIndex < filled.length - 1 || index < sizes.length;
      return finalized
        ? placeEvenRow(entry.row, entry.sizes)
        : placePackedRow(entry.row, entry.sizes);
    });
    pages.push(page);
  }
  return pages;
}

export const IMAGE_SHELF_COVER_SIZE = 110;

/**
 * 4段目（bay 3）だけ作品を拡大する倍率。縦横同じ。
 * 下端（sitY / bottomY）は変えない。1 に戻すと従来サイズ。
 */
/** 1 に戻すと従来サイズ。number にして切替比較を可能にする。 */
export const IMAGE_SHELF_BAY3_SIZE_SCALE: number = 1.05;

function sizeForBay(bay: number, size: ImageShelfSize): ImageShelfSize {
  if (bay !== 3 || IMAGE_SHELF_BAY3_SIZE_SCALE === 1) return size;
  return {
    width: size.width * IMAGE_SHELF_BAY3_SIZE_SCALE,
    height: size.height * IMAGE_SHELF_BAY3_SIZE_SCALE,
  };
}

export type ImageShelfBayLayout = {
  bay: number;
  xs: readonly [number, number, number, number, number];
  size: number;
  sitY: number;
};

/**
 * 各段レイアウト（試作確定値）
 * - 3段目右端枠(640–750)は固定レコード左縁(~770)と非重複
 * - 4段目左端枠(228–)は固定背表紙右端(~212)と非重複
 * - 4段目 size のみ IMAGE_SHELF_BAY3_SIZE_SCALE を反映（xs・sitY は従来値）
 */
export const IMAGE_SHELF_BAYS: readonly ImageShelfBayLayout[] = [
  { bay: 0, size: 110, sitY: 152, xs: [122, 280, 439, 597, 755] },
  { bay: 1, size: 110, sitY: 286, xs: [122, 280, 439, 597, 755] },
  { bay: 2, size: 110, sitY: 432, xs: [95, 231, 367, 504, 640] },
  {
    bay: 3,
    size: IMAGE_SHELF_COVER_SIZE * IMAGE_SHELF_BAY3_SIZE_SCALE,
    sitY: 592,
    xs: [228, 366, 504, 642, 780],
  },
] as const;

export type ImageShelfSlot = {
  pageIndex: number;
  bay: number;
  slot: number;
  globalIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sitY: number;
};

export function isNearImageShelfLed(placed: {
  x: number;
  width: number;
  bay: number;
}): boolean {
  const cx = placed.x + placed.width / 2;
  const nearX = Math.abs(cx - IMAGE_SHELF_LED_CENTER_X) < 100;
  return nearX && (placed.bay === 0 || placed.bay === 1 || placed.bay === 2);
}

export function toImageShelfPercent(box: {
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

/**
 * 旧5列20枠（表紙フィット比較が参照）。
 * 座標は変えない。本番の画像棚のページ分割には使わない。
 */
export function imageShelfSlotsForPage(pageIndex: number): ImageShelfSlot[] {
  const slots: ImageShelfSlot[] = [];
  let local = 0;
  for (const layout of IMAGE_SHELF_BAYS) {
    layout.xs.forEach((x, slot) => {
      const globalIndex = pageIndex * IMAGE_SHELF_PAGE_SIZE + local;
      local += 1;
      slots.push({
        pageIndex,
        bay: layout.bay,
        slot,
        globalIndex,
        x,
        y: layout.sitY - layout.size,
        width: layout.size,
        height: layout.size,
        sitY: layout.sitY,
      });
    });
  }
  return slots;
}

/** 旧5列ヘルパー向け。本番の画像棚は layoutImageShelfPages でページを切る。 */
export function imageShelfPageCount(itemCount: number): number {
  if (itemCount <= 0) return 1;
  return Math.ceil(itemCount / IMAGE_SHELF_PAGE_SIZE);
}

export function clampImageShelfPage(
  pageIndex: number,
  itemCount: number
): number {
  const max = Math.max(0, imageShelfPageCount(itemCount) - 1);
  return Math.max(0, Math.min(pageIndex, max));
}
