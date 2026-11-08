"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { COVER_SHELF_RICH_ITEMS } from "../app/dev/cover-shelf-preview/items";
import { type ShelfGeometry, svgShelfBays } from "./SvgShelfFrame";
import SvgShelfNatural, {
  REF_B_DEPTH,
  type BoardJointShade,
  type NaturalLook,
  type ShelfDepthParams,
} from "./SvgShelfNatural";
import styles from "./SvgShelfBLayoutVerify.module.css";

/**
 * 参考画像B（512×512）同一座標系の再測定。
 * 棚外枠・内枠・sitY・作品外接矩形をエッジ投票＋スキャンラインで確定。
 * viewBox は外枠 479×369。判定は SVG棚＋ジャケットのみ（Bを背景にしない）。
 *
 * 内枠: x 33–480（stile 左右各16）
 * 天井下端: y 88 / 180 / 264 / 347
 * 床前端 sitY: 172 / 255 / 338 / 434
 */
export const REF_B = {
  imageSize: 512,
  shelf: { x0: 17, y0: 77, x1: 496, y1: 446 },
  /** 各段の内側天井（上板下面付近） */
  ceilingY: [88, 180, 264, 347] as const,
  /** 各段の作品下端＝棚板上面の前端 */
  sitY: [172, 255, 338, 434] as const,
  /** 内側有効幅の左端・右端（画像px） */
  inner: { x0: 33, x1: 480 } as const,
  /** 棚板正面の厚み（画像px。上板・中板・底板） */
  boardThick: [8, 7, 8, 8, 11] as const,
  /** 左右側板の正面幅（画像px） */
  stile: 16,
  /**
   * 変更前の作品外接矩形（サイズ不統一）。比較用に保持。
   * 2-1『1Q84』は画像スキャンで再測定（下記 UNIT_JACKET）。
   */
  worksVaried: [
    { bay: 0, x0: 58, x1: 146, bottom: 172, top: 114, label: "1-1" },
    { bay: 0, x0: 164, x1: 254, bottom: 172, top: 105, label: "1-2" },
    { bay: 0, x0: 286, x1: 362, bottom: 172, top: 102, label: "1-3" },
    { bay: 0, x0: 380, x1: 456, bottom: 172, top: 100, label: "1-4" },
    { bay: 1, x0: 67, x1: 125, bottom: 254, top: 187, label: "2-1" },
    { bay: 1, x0: 146, x1: 208, bottom: 255, top: 184, label: "2-2" },
    { bay: 1, x0: 216, x1: 276, bottom: 255, top: 183, label: "2-3" },
    { bay: 1, x0: 290, x1: 362, bottom: 255, top: 182, label: "2-4" },
    { bay: 1, x0: 376, x1: 448, bottom: 255, top: 182, label: "2-5" },
    { bay: 2, x0: 62, x1: 148, bottom: 338, top: 268, label: "3-1" },
    { bay: 2, x0: 164, x1: 256, bottom: 338, top: 268, label: "3-2" },
    { bay: 2, x0: 276, x1: 358, bottom: 338, top: 265, label: "3-3" },
    { bay: 2, x0: 376, x1: 456, bottom: 338, top: 268, label: "3-4" },
    { bay: 3, x0: 52, x1: 182, bottom: 434, top: 352, label: "4-1" },
    { bay: 3, x0: 190, x1: 274, bottom: 434, top: 354, label: "4-2" },
    { bay: 3, x0: 288, x1: 374, bottom: 434, top: 353, label: "4-3" },
    { bay: 3, x0: 382, x1: 460, bottom: 434, top: 352, label: "4-4" },
  ],
} as const;

type WorkRect = {
  bay: number;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  label: string;
};

/**
 * 統一ジャケット寸法の基準:
 * 参考画像B・2段目左端『1Q84』の外接矩形を画像スキャンで測定。
 * 画像座標: x 67–125 / y 187–254（幅58・高さ67）。
 * 棚外寸479×369座標系でも同値（shelf原点オフセットのみ）。
 */
export const UNIT_JACKET = {
  sourceLabel: "1Q84",
  bay: 1,
  slot: "2-1",
  /** 512画像上の外接（右・下は排他） */
  imageRect: { x0: 67, x1: 125, top: 187, bottom: 254 },
  width: 58,
  height: 67,
} as const;

/** 直前までの比較用（ノルウェイ基準の B案 63×72） */
export const PREV_UNIT_SIZE = { width: 63, height: 72 } as const;

export type SizeKey = "prev" | "unit";

export const SIZE_VARIANTS: Record<
  SizeKey,
  { key: SizeKey; label: string; width: number; height: number }
> = {
  prev: {
    key: "prev",
    label: "変更前 63×72",
    width: PREV_UNIT_SIZE.width,
    height: PREV_UNIT_SIZE.height,
  },
  unit: {
    key: "unit",
    label: "1Q84基準 58×67",
    width: UNIT_JACKET.width,
    height: UNIT_JACKET.height,
  },
};

const BAY_COUNTS = [4, 5, 4, 4] as const;

/** 段内に等間隔で統一サイズを並べる。収まらない場合は fitIssues に記録（縮小しない）。 */
export function buildUniformWorks(
  width: number,
  height: number,
): {
  works: WorkRect[];
  fitIssues: string[];
  size: { width: number; height: number };
} {
  const fitIssues: string[] = [];
  const works: WorkRect[] = [];
  const innerL = REF_B.inner.x0;
  const innerR = REF_B.inner.x1;
  const innerW = innerR - innerL;

  BAY_COUNTS.forEach((count, bay) => {
    const clearH = REF_B.sitY[bay] - REF_B.ceilingY[bay];
    if (height > clearH) {
      fitIssues.push(
        `段${bay + 1}: 高さ ${height}px > 段内高 ${clearH}px（超過 ${height - clearH}px・縮小せず）`,
      );
    }
    const needW = count * width;
    if (needW > innerW) {
      fitIssues.push(
        `段${bay + 1}: 幅合計 ${needW}px > 内幅 ${innerW}px（縮小せず）`,
      );
    }
    const remaining = Math.max(0, innerW - needW);
    const gap = remaining / (count + 1);
    const sit = REF_B.sitY[bay];
    for (let i = 0; i < count; i += 1) {
      const x0 = Math.round(innerL + gap + i * (width + gap));
      const x1 = x0 + width;
      works.push({
        bay,
        x0,
        x1,
        top: sit - height,
        bottom: sit,
        label: `${bay + 1}-${i + 1}`,
      });
    }
  });

  return { works, fitIssues, size: { width, height } };
}

export const SIZE_BUILDS = {
  prev: buildUniformWorks(SIZE_VARIANTS.prev.width, SIZE_VARIANTS.prev.height),
  unit: buildUniformWorks(SIZE_VARIANTS.unit.width, SIZE_VARIANTS.unit.height),
} as const;

/** @deprecated 互換: 1Q84基準 */
export const UNIFORM_WORKS = SIZE_BUILDS.unit.works;
export const UNIFORM_FIT_ISSUES = SIZE_BUILDS.unit.fitIssues;

/** 変更前（平面寄り）— 作品座標は同一、棚板厚・奥行きのみ旧値 */
const BEFORE_BOARD_THICK = [16, 13, 13, 13, 14] as const;
const BEFORE_STILE = 20;

/** 参考Bの並びに近い既存プレビュー作品をスロットへ割り当て */
const JACKET_IDS = [
  "spine-preview-music-0",
  "spine-preview-book-2",
  "spine-preview-game-1",
  "spine-preview-music-4",
  "spine-preview-book-1",
  "spine-preview-book-4",
  "spine-preview-book-5",
  "spine-preview-music-1",
  "spine-preview-manga-4",
  "spine-preview-movie-1",
  "spine-preview-music-3",
  "spine-preview-movie-3",
  "spine-preview-game-2",
  "spine-preview-manga-1",
  "spine-preview-movie-4",
  "spine-preview-music-2",
  "spine-preview-game-4",
] as const;

const FILL = [
  "#e85d4c",
  "#3b82f6",
  "#22a06b",
  "#d4a017",
  "#8b5cf6",
  "#0d9488",
  "#f97316",
  "#64748b",
] as const;

type ShelfVariant = "after" | "before";

function refToShelfX(x: number) {
  return x - REF_B.shelf.x0;
}

function refToShelfY(y: number) {
  return y - REF_B.shelf.y0;
}

export function geometryFromRefB(variant: ShelfVariant = "after"): ShelfGeometry {
  const viewWidth = REF_B.shelf.x1 - REF_B.shelf.x0;
  const viewHeight = REF_B.shelf.y1 - REF_B.shelf.y0;
  const stile = variant === "after" ? REF_B.stile : BEFORE_STILE;
  const sitLocal = REF_B.sitY.map(refToShelfY);
  const front = [...(variant === "after" ? REF_B.boardThick : BEFORE_BOARD_THICK)];
  const centers = [
    front[0] / 2,
    sitLocal[0] + front[1] / 2,
    sitLocal[1] + front[2] / 2,
    sitLocal[2] + front[3] / 2,
    sitLocal[3] + front[4] / 2,
  ];
  return {
    viewWidth,
    viewHeight,
    outerLeft: 0,
    outerRight: viewWidth,
    stile,
    centers,
    front,
  };
}

export type MappedWork = {
  label: string;
  bay: number;
  imageUrl?: string;
  title?: string;
  ref: { x0: number; x1: number; top: number; bottom: number; width: number; height: number };
  svg: { x: number; y: number; width: number; height: number; bottom: number };
};

/** flat=手前寄り接地 / recess=奥寄り接地（サイズは変えず inset と陰影で奥行き） */
export type GroundingMode = "flat" | "recess";

/**
 * 接地 inset。recess でも天井を食い込まない上限を守る（サイズ縮小はしない）。
 * 段高に対し作品が高い段は、inset を取りすぎずヘッドルームを優先し、
 * 手前棚板は DeckNearCaps の重なりで示す。
 *
 * inset が大きいほど奥（木口から離れる）。手前へ寄せる = inset を減らす。
 */
export function computeSitInset(
  bay: ReturnType<typeof svgShelfBays>["bays"][number] | undefined,
  workHeight: number,
  mode: GroundingMode,
): number {
  if (!bay) return 0.8;
  const bayClear = Math.max(1, bay.deckFrontY - bay.ceilingY);
  const fillRatio = workHeight / bayClear;
  /**
   * 窮屈段: 幾何ヘッドルームは最低限残し、手前上面は DeckNearCaps の重なりで稼ぐ。
   * 上の窮屈さは天井 AO・作品上端フェードで視覚緩和する。
   */
  const minHeadroom = mode === "recess" && fillRatio > 0.9 ? 1.15 : 0.8;
  const maxByHeadroom = Math.max(0.35, bayClear - workHeight - minHeadroom);
  if (mode === "flat") {
    if (bay.deckDepth <= 0) return Math.min(0.8, maxByHeadroom);
    return Math.min(
      Math.min(Math.max(0.7, bay.deckDepth * 0.28), bay.deckDepth * 0.42),
      maxByHeadroom,
    );
  }
  // 奥寄り: 取れる分だけ inset。窮屈段は上限いっぱいまで使い、手前上面を優先。
  if (bay.deckDepth <= 0) return Math.min(fillRatio > 0.9 ? 2.2 : 4.5, maxByHeadroom);
  const target =
    fillRatio > 0.9
      ? Math.min(Math.max(1.8, bay.deckDepth * 0.48), bay.deckDepth * 0.72)
      : Math.min(Math.max(4.2, bay.deckDepth * 0.78), bay.deckDepth * 0.92);
  return Math.min(target, maxByHeadroom);
}

/**
 * 段ごとの手前補正（SVG px）。index0=1段目は常に 0。
 * approved = 合格版（2段 −3.0 / 3・4段 −3.5）
 * trialBay3 = 合格版＋3段目だけ追加 −0.5（合計 −4.0）
 */
export const FORWARD_NUDGE_BY_BAY = {
  baseline: [0, 0, 0, 0],
  mid: [0, 0.5, 0.5, 0.5],
  current: [0, 2, 2, 2],
  prevFinal: [0, 2.5, 2.5, 2.5],
  uniform30: [0, 3, 3, 3],
  /** 合格版: 2段 −3.0 / 3・4段 −3.5 */
  approved: [0, 3, 3.5, 3.5],
  /** 今回候補: 3段目のみ追加 −0.5（inset 2.42→1.92） */
  trialBay3: [0, 3, 4, 3.5],
} as const;

export type ForwardNudgeKey = keyof typeof FORWARD_NUDGE_BY_BAY;
export type ForwardNudgeProfile = readonly [number, number, number, number];

/** 接地 inset に手前補正を適用。木口より手前（inset < 0.35）には出さない。 */
export function applyForwardNudge(
  baseInset: number,
  bayIndex: number,
  profile: ForwardNudgeProfile | readonly number[],
): number {
  const nudgePx = profile[bayIndex] ?? 0;
  if (nudgePx <= 0) return baseInset;
  return Math.max(0.35, baseInset - nudgePx);
}

/**
 * Bトレース座標をSVGへ写像。
 * recess 時は作品を棚板上面の奥へ接地し、手前に上面が見えるようにする。
 * forwardNudge: 段ごとの inset 減算（段階差を保ったまま手前へ）。
 */
export function mappedWorksFromRefB(
  layout: ReturnType<typeof svgShelfBays>,
  sourceWorks: readonly WorkRect[] = UNIFORM_WORKS,
  grounding: GroundingMode = "recess",
  forwardNudge: ForwardNudgeProfile | readonly number[] = FORWARD_NUDGE_BY_BAY.baseline,
): MappedWork[] {
  return sourceWorks.map((work, index) => {
    const width = work.x1 - work.x0;
    const height = work.bottom - work.top;
    const item = COVER_SHELF_RICH_ITEMS.find((entry) => entry.id === JACKET_IDS[index]);
    const bay = layout.bays[work.bay];
    const deckFrontY = refToShelfY(work.bottom);
    const baseInset = computeSitInset(bay, height, grounding);
    const sitInset = applyForwardNudge(baseInset, work.bay, forwardNudge);
    const bottom = deckFrontY - sitInset;
    const top = bottom - height;
    return {
      label: work.label,
      bay: work.bay,
      imageUrl: item?.imageUrl,
      title: item?.title,
      ref: {
        x0: work.x0,
        x1: work.x1,
        top: work.top,
        bottom: work.bottom,
        width,
        height,
      },
      svg: {
        x: refToShelfX(work.x0),
        y: top,
        width,
        height,
        bottom,
      },
    };
  });
}

/** 段ごとの占有比率（B画像px / 実装SVGで同一定義） */
export function bayOccupancyStats(
  works: readonly WorkRect[],
  innerX0 = REF_B.inner.x0,
  innerX1 = REF_B.inner.x1,
) {
  const innerW = innerX1 - innerX0;
  return [0, 1, 2, 3].map((bay) => {
    const list = works.filter((w) => w.bay === bay);
    const clearH = REF_B.sitY[bay] - REF_B.ceilingY[bay];
    const gaps = list.slice(1).map((w, i) => w.x0 - list[i].x1);
    const widths = list.map((w) => w.x1 - w.x0);
    const heights = list.map((w) => w.bottom - w.top);
    const headrooms = list.map((w) => w.top - REF_B.ceilingY[bay]);
    const totalW = widths.reduce((s, w) => s + w, 0);
    const avgH = heights.reduce((s, h) => s + h, 0) / Math.max(1, heights.length);
    return {
      bay,
      clearH,
      innerW,
      fillWidthRatio: totalW / innerW,
      avgHeightRatio: avgH / clearH,
      leftPad: list[0].x0 - innerX0,
      rightPad: innerX1 - list[list.length - 1].x1,
      gaps,
      widths,
      heights,
      headrooms,
      sitDeltas: list.map((w) => REF_B.sitY[bay] - w.bottom),
    };
  });
}

/**
 * 設計図に基づく接合試作（中間横板1枚・左のみ）。
 * 横板のX・長さは不変。内側面の重ね＋接触影＋ハイライトのみ。
 */
const BOARD_JOINT_SHADE: BoardJointShade = {
  boardIndex: 2,
  cheekWidth: 2.8,
};

function ShelfStage({
  geometry,
  depth,
  look,
  between,
  boardJointShade = null,
}: {
  geometry: ShelfGeometry;
  depth: ShelfDepthParams;
  look: NaturalLook;
  between: ReactNode;
  boardJointShade?: BoardJointShade | null;
}) {
  return (
    <div
      className={styles.stage}
      style={
        {
          "--shelf-w": String(geometry.viewWidth),
          "--shelf-h": String(geometry.viewHeight),
        } as CSSProperties
      }
    >
      <SvgShelfNatural
        geometry={geometry}
        depth={depth}
        look={look}
        between={between}
        boardJointShade={boardJointShade}
        className={styles.shelfWrap}
      />
    </div>
  );
}

function RefShelfCrop() {
  const { imageSize, shelf } = REF_B;
  const shelfW = shelf.x1 - shelf.x0;
  const shelfH = shelf.y1 - shelf.y0;
  return (
    <div className={styles.refCrop}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.refCropImg}
        src="/dev/ref-b-chic.png"
        alt="参考画像B"
        width={imageSize}
        height={imageSize}
        style={
          {
            "--ref-size": imageSize,
            "--shelf-w": shelfW,
            "--shelf-h": shelfH,
            "--crop-x": shelf.x0,
            "--crop-y": shelf.y0,
          } as CSSProperties
        }
      />
    </div>
  );
}

/** 棚板奥・角の環境遮蔽（作品より後ろ）。recess で奥の暗さを強調。 */
function BayAmbient({
  layout,
  recess,
}: {
  layout: ReturnType<typeof svgShelfBays>;
  recess: boolean;
}) {
  return (
    <g aria-hidden="true">
      {layout.bays.map((bay) => {
        const h = Math.max(4, bay.deckFrontY - bay.ceilingY);
        const w = Math.max(0, bay.innerRight - bay.innerLeft);
        return (
          <g key={`ao-${bay.index}`}>
            {/* 背面の暗い空間 */}
            {recess && (
              <rect
                x={bay.innerLeft}
                y={bay.ceilingY}
                width={w}
                height={h}
                fill="#0e0a08"
                opacity={0.3}
              />
            )}
            {/* 天井直下の帯影（2–3段の窮屈さを視覚的に緩和） */}
            <rect
              x={bay.innerLeft + 1}
              y={bay.ceilingY}
              width={Math.max(0, w - 2)}
              height={Math.min(recess ? 20 : 10, h * (recess ? 0.34 : 0.18))}
              fill="#1a100c"
              opacity={recess ? 0.44 : 0.2}
            />
            {/* 左右奥角 */}
            <rect
              x={bay.innerLeft}
              y={bay.ceilingY}
              width={recess ? 12 : 7}
              height={h}
              fill="#1a100c"
              opacity={recess ? 0.28 : 0.14}
            />
            <rect
              x={bay.innerRight - (recess ? 12 : 7)}
              y={bay.ceilingY}
              width={recess ? 12 : 7}
              height={h}
              fill="#1a100c"
              opacity={recess ? 0.3 : 0.16}
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * 棚板上面の見え方プロファイル。
 * legacy=従来の明るい水平帯 / refB=上段ほど上面を抑え、木口の明暗中心。
 * 作品の接地座標・inset は変更しない（見た目の上面露出のみ）。
 */
export type DeckTopProfile = "legacy" | "refB";

/** 段ごと（作品が乗る床＝支える棚板）。露出・明るさ・重なりの係数 */
const DECK_TOP_REF_B = [
  // 1段目を支える板: 上面ほぼ見せない（投影帯を塗り潰し気味に消す）
  { expose: 0.05, overlap: 0.12, base: 0.04, bright: 0.04, mute: 0.88, contact: 0.3 },
  // 2段目を支える板: 同上・極めて控えめ
  { expose: 0.07, overlap: 0.14, base: 0.05, bright: 0.05, mute: 0.82, contact: 0.32 },
  // 3段目を支える板: わずかに上面
  { expose: 0.28, overlap: 0.32, base: 0.16, bright: 0.14, mute: 0.38, contact: 0.26 },
  // 最下段: 控えめな奥行きを残す
  { expose: 0.5, overlap: 0.42, base: 0.24, bright: 0.2, mute: 0.12, contact: 0.24 },
] as const;

/**
 * 投影上面の明るい帯を段ごとに抑える（作品より後ろに描くのでジャケットを覆わない）。
 * 接地座標は変えず、陰影のみ。
 */
function DeckTopMute({
  layout,
  works,
  profile,
}: {
  layout: ReturnType<typeof svgShelfBays>;
  works: MappedWork[];
  profile: DeckTopProfile;
}) {
  if (profile !== "refB") return null;
  return (
    <g aria-hidden="true">
      {layout.bays.map((bay) => {
        const sample = works.find((w) => w.bay === bay.index);
        if (!sample) return null;
        const cfg = DECK_TOP_REF_B[bay.index] ?? DECK_TOP_REF_B[3];
        if (cfg.mute <= 0.05) return null;
        const stripNatural = Math.max(0, bay.deckFrontY - sample.svg.bottom);
        const deckSpan = Math.max(stripNatural, bay.deckDepth, 0.8);
        const muteTop = bay.deckFrontY - deckSpan;
        const muteH = Math.max(0.5, bay.deckFrontY - muteTop);
        const w = Math.max(0, bay.innerRight - bay.innerLeft);
        const midX = (bay.innerLeft + bay.innerRight) / 2;
        const muteId = `deck-mute-${bay.index}`;
        return (
          <g key={muteId}>
            <defs>
              <linearGradient
                id={muteId}
                gradientUnits="userSpaceOnUse"
                x1={midX}
                y1={muteTop}
                x2={midX}
                y2={bay.deckFrontY}
              >
                <stop offset="0%" stopColor="#2a1810" stopOpacity={cfg.mute * 0.9} />
                <stop offset="65%" stopColor="#4a2e1c" stopOpacity={cfg.mute * 0.55} />
                <stop offset="100%" stopColor="#5a3824" stopOpacity={cfg.mute * 0.2} />
              </linearGradient>
            </defs>
            <rect
              x={bay.innerLeft}
              y={muteTop}
              width={w}
              height={muteH}
              fill="#4a2e1c"
              opacity={cfg.mute * 0.75}
            />
            <rect
              x={bay.innerLeft}
              y={muteTop}
              width={w}
              height={muteH}
              fill={`url(#${muteId})`}
            />
          </g>
        );
      })}
    </g>
  );
}

/** 作品の手前に描く棚板上面。描画順で前後関係は維持し、露出量だけ段差をつける。 */
function DeckNearCaps({
  layout,
  works,
  recess,
  profile = "refB",
}: {
  layout: ReturnType<typeof svgShelfBays>;
  works: MappedWork[];
  recess: boolean;
  profile?: DeckTopProfile;
}) {
  if (!recess) return null;
  return (
    <g aria-hidden="true">
      {layout.bays.map((bay) => {
        const sample = works.find((w) => w.bay === bay.index);
        if (!sample) return null;
        const stripNatural = Math.max(0, bay.deckFrontY - sample.svg.bottom);
        const w = Math.max(0, bay.innerRight - bay.innerLeft);
        const midX = (bay.innerLeft + bay.innerRight) / 2;
        const id = `deck-near-${profile}-${bay.index}`;

        if (profile === "legacy") {
          const tight = stripNatural < 2.8;
          const overlap = tight
            ? Math.min(2.8, Math.max(1.6, bay.deckDepth * 0.28 + 0.8))
            : Math.min(1.2, Math.max(0.55, bay.deckDepth * 0.12));
          const nearTop = sample.svg.bottom - overlap;
          const nearBottom = bay.deckFrontY;
          const stripH = nearBottom - nearTop;
          if (stripH < 0.8) return null;
          return (
            <g key={id}>
              <defs>
                <linearGradient
                  id={id}
                  gradientUnits="userSpaceOnUse"
                  x1={midX}
                  y1={nearTop}
                  x2={midX}
                  y2={nearBottom}
                >
                  <stop offset="0%" stopColor="#3a2214" stopOpacity={tight ? 0.72 : 0.45} />
                  <stop offset="35%" stopColor="#8a5634" stopOpacity={tight ? 0.58 : 0.34} />
                  <stop offset="70%" stopColor="#c89860" stopOpacity={tight ? 0.55 : 0.36} />
                  <stop offset="100%" stopColor="#e8b878" stopOpacity={tight ? 0.7 : 0.5} />
                </linearGradient>
              </defs>
              <rect
                x={bay.innerLeft}
                y={nearTop}
                width={w}
                height={stripH}
                fill="#a07042"
                opacity={tight ? 0.55 : 0.28}
              />
              <rect
                x={bay.innerLeft}
                y={nearTop}
                width={w}
                height={stripH}
                fill={`url(#${id})`}
              />
              <rect
                x={bay.innerLeft}
                y={nearBottom - Math.min(1.5, stripH)}
                width={w}
                height={Math.min(1.5, stripH)}
                fill="#f0d4aa"
                opacity={0.48}
              />
              <rect
                x={bay.innerLeft + 2}
                y={nearTop}
                width={Math.max(0, w - 4)}
                height={Math.min(1.35, stripH * 0.4)}
                fill="#1a0c06"
                opacity={0.32}
              />
            </g>
          );
        }

        const cfg = DECK_TOP_REF_B[bay.index] ?? DECK_TOP_REF_B[3];
        const overlap = Math.min(
          stripNatural + 0.9,
          Math.max(0.25, (stripNatural + 0.6) * cfg.overlap),
        );
        const nearBottom = bay.deckFrontY;
        const rawStrip = nearBottom - (sample.svg.bottom - overlap);
        const stripH = Math.max(0.45, rawStrip * cfg.expose + (1 - cfg.expose) * 0.45);
        const stripTop = nearBottom - stripH;

        return (
          <g key={id}>
            <defs>
              <linearGradient
                id={id}
                gradientUnits="userSpaceOnUse"
                x1={midX}
                y1={stripTop}
                x2={midX}
                y2={nearBottom}
              >
                <stop offset="0%" stopColor="#3a2214" stopOpacity={0.35 * cfg.base} />
                <stop offset="55%" stopColor="#8a5634" stopOpacity={0.28 * cfg.base} />
                <stop offset="100%" stopColor="#c89860" stopOpacity={0.22 * cfg.bright} />
              </linearGradient>
            </defs>
            {/* 手前のごく薄い上面＋接地陰（明るい帯にしない） */}
            <rect
              x={bay.innerLeft}
              y={stripTop}
              width={w}
              height={stripH}
              fill={`url(#${id})`}
            />
            <rect
              x={bay.innerLeft + 1}
              y={sample.svg.bottom - 0.35}
              width={Math.max(0, w - 2)}
              height={0.9}
              fill="#1a0c06"
              opacity={cfg.contact}
            />
            {/* 木口直前の細い明暗（厚みは変えず縁だけ） */}
            <rect
              x={bay.innerLeft}
              y={nearBottom - 0.7}
              width={w}
              height={0.7}
              fill="#e8c090"
              opacity={Math.max(0.04, cfg.bright * 0.35)}
            />
            <rect
              x={bay.innerLeft}
              y={nearBottom - 1.15}
              width={w}
              height={0.45}
              fill="#1a0c06"
              opacity={0.14 + cfg.contact * 0.2}
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * ジャケット立体: 光源は左上。棚の内側に収まったまま奥に置く。
 * recess 時は背後影・天井側の暗がり・手前の棚板上面を強調。
 */
export function Jackets({
  works,
  layout,
  recess,
  deckProfile = "refB",
  filterSuffix = "a",
}: {
  works: MappedWork[];
  layout: ReturnType<typeof svgShelfBays>;
  recess: boolean;
  deckProfile?: DeckTopProfile;
  filterSuffix?: string;
}) {
  const filterId = `jacket-soft-shadow-${filterSuffix}`;
  return (
    <g aria-label="B寸法再現のジャケット">
      <defs>
        <filter
          id={filterId}
          x="-18%"
          y="-10%"
          width="140%"
          height="125%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation={recess ? 1.6 : 1.1} result="blur" />
          <feOffset dx={recess ? 1.8 : 1.2} dy={recess ? 0.9 : 0.6} result="off" />
          <feComponentTransfer in="off" result="shadow">
            <feFuncA type="linear" slope={recess ? 0.38 : 0.28} />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <BayAmbient layout={layout} recess={recess} />
      <DeckTopMute layout={layout} works={works} profile={deckProfile} />
      {works.map((work, index) => {
        const { x, y, width: w, height: h, bottom } = work.svg;
        const edge = Math.min(1.8, Math.max(1.1, w * 0.028));
        const topLip = 0.9;
        const topFadeId = `top-fade-${filterSuffix}-${work.label}`;
        const castId = `cast-${filterSuffix}-${work.label}`;
        return (
          <g key={work.label}>
            {/* 背面への落ち影（フィルタ外・右下にずらして覗かせる） */}
            {recess && (
              <>
                <defs>
                  <filter
                    id={castId}
                    x="-20%"
                    y="-10%"
                    width="150%"
                    height="130%"
                    colorInterpolationFilters="sRGB"
                  >
                    <feGaussianBlur stdDeviation="1.8" />
                  </filter>
                </defs>
                <rect
                  x={x + 2.4}
                  y={y + 1.6}
                  width={w - 0.5}
                  height={h - 0.8}
                  fill="#0c0806"
                  opacity={0.28}
                  filter={`url(#${castId})`}
                />
              </>
            )}
            <g filter={`url(#${filterId})`}>
              {/* 接地影（棚板上面上） */}
              <ellipse
                cx={x + w * 0.52}
                cy={bottom + 0.35}
                rx={Math.max(5, w * 0.46)}
                ry={recess ? 1.55 : 1.25}
                fill="#1a0c06"
                opacity={recess ? 0.4 : 0.32}
              />
              <rect
                x={x + 1}
                y={bottom - 0.35}
                width={Math.max(0, w - 1.5)}
                height={1.15}
                fill="#1a0c06"
                opacity={0.26}
              />
              <path
                d={`M ${x + w} ${y + topLip} L ${x + w + edge} ${y + topLip + 0.6} L ${x + w + edge} ${bottom - 0.4} L ${x + w} ${bottom} Z`}
                fill="#2a1810"
                opacity={0.55}
              />
              <path
                d={`M ${x} ${y} L ${x + w} ${y} L ${x + w + edge * 0.35} ${y + topLip} L ${x + 0.4} ${y + topLip} Z`}
                fill="#3a2418"
                opacity={0.35}
              />
              {work.imageUrl ? (
                <image
                  href={work.imageUrl}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  preserveAspectRatio="xMidYMid slice"
                >
                  <title>{work.title ?? work.label}</title>
                </image>
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={FILL[index % FILL.length]}
                  fillOpacity={0.75}
                />
              )}
              {/* 上端を天井側の暗がりへ溶かす（サイズは維持、窮屈さの視覚緩和） */}
              {recess && (
                <>
                  <defs>
                    <linearGradient
                      id={topFadeId}
                      gradientUnits="userSpaceOnUse"
                      x1={x}
                      y1={y}
                      x2={x}
                      y2={y + Math.min(18, h * 0.3)}
                    >
                      <stop offset="0%" stopColor="#0c0806" stopOpacity="0.55" />
                      <stop offset="55%" stopColor="#0c0806" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#0c0806" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={Math.min(18, h * 0.3)}
                    fill={`url(#${topFadeId})`}
                  />
                </>
              )}
              <line
                x1={x + 0.4}
                y1={y + 0.5}
                x2={x + 0.4}
                y2={bottom - 0.5}
                stroke="#f5e6d4"
                strokeWidth={0.6}
                opacity={0.16}
              />
              <line
                x1={x + w - 0.35}
                y1={y + 0.8}
                x2={x + w - 0.35}
                y2={bottom - 0.4}
                stroke="#1a0c06"
                strokeWidth={0.7}
                opacity={0.16}
              />
            </g>
          </g>
        );
      })}
      {/* 作品より手前の棚板上面（露出量のみ profile で調整） */}
      <DeckNearCaps
        layout={layout}
        works={works}
        recess={recess}
        profile={deckProfile}
      />
    </g>
  );
}

function useDepthShelf(
  sizeKey: SizeKey,
  grounding: GroundingMode = "recess",
  deckProfile: DeckTopProfile = "refB",
  forwardNudge: ForwardNudgeProfile | readonly number[] = FORWARD_NUDGE_BY_BAY.baseline,
  boardJointShade: BoardJointShade | null = null,
) {
  const geometry = useMemo(() => geometryFromRefB("after"), []);
  const depth = REF_B_DEPTH;
  const look: NaturalLook = "ref-b";
  const layout = useMemo(() => svgShelfBays(depth, geometry), [depth, geometry]);
  const built = SIZE_BUILDS[sizeKey];
  const works = useMemo(
    () => mappedWorksFromRefB(layout, built.works, grounding, forwardNudge),
    [layout, built.works, grounding, forwardNudge],
  );
  return {
    geometry,
    depth,
    look,
    layout,
    works,
    fitIssues: built.fitIssues,
    size: built.size,
    sizeKey,
    grounding,
    deckProfile,
    forwardNudge,
    boardJointShade,
  };
}

/**
 * 作品配置は trialBay3（暫定決定）固定。
 * 接合: X不変・面の重なりと陰影のみ（中間1枚左端）。暫定決定版は保持。
 */
type ViewMode = "before" | "after" | "compare" | "zoom" | "ref3" | "place";

export default function SvgShelfBLayoutVerify() {
  const [view, setView] = useState<ViewMode>("zoom");

  const shelfBefore = useDepthShelf(
    "unit",
    "recess",
    "refB",
    FORWARD_NUDGE_BY_BAY.trialBay3,
    null,
  );
  const shelfAfter = useDepthShelf(
    "unit",
    "recess",
    "refB",
    FORWARD_NUDGE_BY_BAY.trialBay3,
    BOARD_JOINT_SHADE,
  );
  const active = view === "before" || view === "place" ? shelfBefore : shelfAfter;
  const ratio = shelfBefore.geometry.viewWidth / shelfBefore.geometry.viewHeight;
  const protoBoard = BOARD_JOINT_SHADE.boardIndex + 1;

  const stage = (
    shelf: ReturnType<typeof useDepthShelf>,
    caption: string,
    filterSuffix: string,
    key?: string,
  ) => (
    <figure key={key} className={styles.panel}>
      <figcaption>{caption}</figcaption>
      {shelf.fitIssues.length > 0 && (
        <p className={styles.hint} role="status">
          制約: {shelf.fitIssues.join(" / ")}
        </p>
      )}
      <ShelfStage
        geometry={shelf.geometry}
        depth={shelf.depth}
        look={shelf.look}
        boardJointShade={shelf.boardJointShade}
        between={
          <Jackets
            works={shelf.works}
            layout={shelf.layout}
            recess={shelf.grounding === "recess"}
            deckProfile={shelf.deckProfile}
            filterSuffix={filterSuffix}
          />
        }
      />
    </figure>
  );

  const boardTops = active.geometry.centers.map((center, index) => {
    const thick = active.geometry.front[index];
    return {
      index,
      top: center - thick / 2,
      bottom: center + thick / 2,
      thick,
    };
  });

  const insetReport = [0, 1, 2, 3].map((bay) => {
    const b = shelfBefore.layout.bays[bay];
    const h = SIZE_VARIANTS.unit.height;
    const baseInset = computeSitInset(b, h, "recess");
    const inset = applyForwardNudge(baseInset, bay, FORWARD_NUDGE_BY_BAY.trialBay3);
    return {
      bay,
      deckDepth: b.deckDepth,
      inset,
      lip: inset,
    };
  });

  const jointZoom = (
    shelf: ReturnType<typeof useDepthShelf>,
    caption: string,
    filterSuffix: string,
    key?: string,
  ) => {
    const g = shelf.geometry;
    const w = g.viewWidth;
    const h = g.viewHeight;
    const center = g.centers[BOARD_JOINT_SHADE.boardIndex];
    const thick = g.front[BOARD_JOINT_SHADE.boardIndex];
    const cropW = Math.min(110, w * 0.24);
    const cropH = Math.min(130, thick * 10 + 44);
    const y = Math.max(0, center - cropH / 2);
    return (
      <figure key={key} className={styles.panel}>
        <figcaption>{caption}</figcaption>
        <div className={styles.jointZoomProto}>
          <div
            className={styles.jointZoomInner}
            style={
              {
                "--zw": w,
                "--zh": h,
                "--zx": 0,
                "--zy": y,
                "--zcw": cropW,
                "--zch": cropH,
              } as CSSProperties
            }
          >
            <ShelfStage
              geometry={g}
              depth={shelf.depth}
              look={shelf.look}
              boardJointShade={shelf.boardJointShade}
              between={
                <Jackets
                  works={shelf.works}
                  layout={shelf.layout}
                  recess
                  deckProfile={shelf.deckProfile}
                  filterSuffix={filterSuffix}
                />
              }
            />
          </div>
        </div>
      </figure>
    );
  };

  const idealZoom = (
    <figure className={styles.panel}>
      <figcaption>設計図・理想接合（参考）</figcaption>
      <div className={styles.idealJointCrop}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/dev/joint-ideal-a.png" alt="理想の左接合" />
      </div>
    </figure>
  );

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>
        作品配置は暫定決定（58×67 / inset 1.49・1.20・1.92・5.12）を固定。接合試作は中間棚板
        {protoBoard}枚目の左端のみ：横板のX・長さは変えず、側板内側面の重ね＋接触影＋木口上端ハイライト。他接合は未展開。暫定決定版の独立保存:{" "}
        <a href="/dev/svg-shelf-b-decided">/dev/svg-shelf-b-decided</a>
      </p>

      <div className={styles.viewSwitch} role="group" aria-label="接合比較">
        {(
          [
            ["before", "変更前（暫定決定版）"],
            ["after", "変更後（面・陰影）"],
            ["compare", "棚全体で並べる"],
            ["zoom", "接合部を拡大比較"],
            ["ref3", "理想・前・後"],
            ["place", "作品配置のみ"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={view === key ? styles.viewOn : undefined}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "before" &&
        stage(shelfBefore, "変更前 — 暫定決定版（突き当て接合）", "j-before")}
      {view === "after" &&
        stage(
          shelfAfter,
          `変更後 — 棚板${protoBoard}左：内側面 ${BOARD_JOINT_SHADE.cheekWidth}px＋接触影・ハイライト（X不変）`,
          "j-after",
        )}
      {view === "place" &&
        stage(shelfBefore, "作品配置確認 — inset 固定", "place-only")}

      {view === "compare" && (
        <div className={styles.compare}>
          {stage(shelfBefore, "変更前（暫定決定版）", "cmp-before", "cmp-before")}
          {stage(shelfAfter, "変更後（面・陰影）", "cmp-after", "cmp-after")}
        </div>
      )}

      {view === "zoom" && (
        <div className={styles.compare3}>
          {idealZoom}
          {jointZoom(shelfBefore, "拡大・変更前", "zm-before", "zm-before")}
          {jointZoom(shelfAfter, "拡大・変更後", "zm-after", "zm-after")}
        </div>
      )}

      {view === "ref3" && (
        <div className={styles.compare3}>
          <figure className={styles.panel}>
            <figcaption>理想B（参考画像・棚枠）</figcaption>
            <div className={styles.stage}>
              <RefShelfCrop />
            </div>
          </figure>
          {stage(shelfBefore, "変更前", "r3-before", "r3-before")}
          {stage(shelfAfter, "変更後", "r3-after", "r3-after")}
        </div>
      )}

      <section className={styles.report}>
        <h2>接合・配置レポート（面・陰影プロトタイプ / X不変）</h2>
        <ul>
          <li>
            棚外寸: {shelfBefore.geometry.viewWidth} × {shelfBefore.geometry.viewHeight}（比{" "}
            {ratio.toFixed(4)}）— 構造寸法・作品位置は不変
          </li>
          <li>
            設計図: 側板前面が手前、内側面は少し暗く、横板上面・木口が別面として接続。接触影と木口上端ハイライト
          </li>
          <li>
            試作: 棚板{protoBoard}左のみ。横板座標は不変。stile-return（内側面{" "}
            {BOARD_JOINT_SHADE.cheekWidth}px）を木口手前に重ね、接触影＋ハイライト。側板正面幅{" "}
            {shelfBefore.geometry.stile}px 据え置き
          </li>
          <li>
            限界: 真の奥行き後退は横板を奥平面へ移す必要があり、今回はXを動かさない条件のため「内側面の重ね＋陰影」で近似
          </li>
          <li>作品サイズ {SIZE_VARIANTS.unit.width}×{SIZE_VARIANTS.unit.height}（変更なし）</li>
        </ul>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>段</th>
                <th>deckDepth</th>
                <th>inset（固定）</th>
                <th>前面余裕</th>
              </tr>
            </thead>
            <tbody>
              {insetReport.map((row) => (
                <tr key={row.bay}>
                  <td>{row.bay + 1}</td>
                  <td>{row.deckDepth.toFixed(2)}</td>
                  <td>{row.inset.toFixed(2)}</td>
                  <td>{row.lip.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>段</th>
                <th>w×h</th>
                <th>SVG x,y</th>
                <th>下端−床前端</th>
                <th>作品</th>
              </tr>
            </thead>
            <tbody>
              {active.works.map((work) => {
                const floorTop = boardTops[work.bay + 1]?.top ?? work.svg.bottom;
                const delta = work.svg.bottom - floorTop;
                return (
                  <tr key={work.label}>
                    <td>{work.label}</td>
                    <td>{work.bay + 1}</td>
                    <td>
                      {work.ref.width}×{work.ref.height}
                    </td>
                    <td>
                      {work.svg.x.toFixed(1)},{work.svg.y.toFixed(1)}
                    </td>
                    <td>{delta.toFixed(2)}</td>
                    <td>{work.title ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
