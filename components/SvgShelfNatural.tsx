import type { ReactNode } from "react";
import {
  shelfGeometryForBays,
  svgShelfFaces,
  type ShelfGeometry,
} from "./SvgShelfFrame";
import styles from "./SvgShelfFrame.module.css";

/**
 * リアル木目版と同じテクスチャ。奥行きだけ弱め、接合は線ではなく面の明暗で示す。
 * depthY/depthX はこのモード専用。保存版の既定値は変えない。
 * bayCount は作品配置実験用。空の自然遠近版は常に 4。
 */
const TEX_H = "/textures/wood/wood027-color.jpg";
const TEX_V = "/textures/wood/wood027-color-v.jpg";

/** 理想Bに合わせて、奥へ伸びる面の見かけを約1/3に抑える */
export const NATURAL_DEPTH = { depthY: 0.082, depthX: 0.034 } as const;

/**
 * 参考画像B実測（512px・棚枠内）:
 * 側板内側の奥行き ≈16px → depthX≈0.072
 * 下段上面の見え ≈9–11px、上段も上面が見える → 見下ろし eyeY + depthY≈0.038
 */
export const REF_B_DEPTH = { depthY: 0.036, depthX: 0.075, eyeY: 50 } as const;

export type ShelfDepthParams = { depthY: number; depthX: number; eyeY?: number };
/** ref-b = 理想B寄りの温かい赤茶。ref-b-prev = 改善前の均一ダーク（比較用）。 */
export type NaturalLook = "natural" | "ref-b" | "ref-b-prev";

type Face = ReturnType<typeof svgShelfFaces>[number];
type Point = Face["points"][number];

function pointsAttr(points: Point[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function grainKind(id: string): "h" | "v" | "depth" {
  if (id.startsWith("under") || id.startsWith("deck")) return "depth";
  if (id.startsWith("front") || id === "back") return "h";
  return "v";
}

function shiftFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 280;
}

export type NaturalShelfLayer = "all" | "back" | "front";

type SvgShelfNaturalProps = {
  bayCount?: number;
  /** 未指定なら保存版と同じ段間隔。作品配置実験では大きい pitch を渡す。 */
  pitch?: number;
  /** 渡す場合は bayCount/pitch より優先。作品寸法から組み立てた骨格用。 */
  geometry?: ShelfGeometry;
  /** 省略時は NATURAL_DEPTH。B寸法再現は REF_B_DEPTH を渡す。 */
  depth?: ShelfDepthParams;
  /** ref-b: 参考Bの色・陰影に寄せた面ライティング */
  look?: NaturalLook;
  /**
   * all: 空の棚用（従来どおりの面順）。
   * back / front: 分割描画用。
   * between を渡すと SVG 内で 奥面 → between → 木口 の順に描画する。
   */
  layer?: NaturalShelfLayer;
  /** 奥面と木口のあいだに挟む内容（作品の foreignObject など） */
  between?: ReactNode;
  /** 木口・側板のさらに手前（接合ディテール用） */
  afterFront?: ReactNode;
  /**
   * 設計図②③⑤⑥の接合試作: 横板の座標・長さは変えず、
   * 側板内側面の重ね＋接触影＋木口上端ハイライトだけで立体感を試す。
   */
  boardJointShade?: BoardJointShade | null;
  className?: string;
};

/** 中間横板1枚・左接合のみ（X不変） */
export type BoardJointShade = {
  boardIndex: number;
  /** 側板内側面の見かけ幅（横板上に薄く重ねる。側板正面幅は不変） */
  cheekWidth: number;
};

function faceLayer(id: string): "back" | "front" {
  if (
    id.startsWith("front") ||
    id.startsWith("stile") ||
    id.startsWith("stile-return")
  ) {
    return "front";
  }
  return "back";
}

function isRefB(look: NaturalLook) {
  return look === "ref-b" || look === "ref-b-prev";
}

/**
 * 横板 front/deck の座標は一切変更しない。
 * 側板内側面（戻り）だけを木口の手前に薄い帯として重ねる。
 */
function insertStileReturnOverlay(
  faces: Face[],
  geometry: ShelfGeometry,
  proto: BoardJointShade,
): Face[] {
  const idx = proto.boardIndex;
  if (idx < 0 || idx >= geometry.centers.length || proto.cheekWidth <= 0) return faces;

  const innerLeft = geometry.outerLeft + geometry.stile;
  const thick = geometry.front[idx];
  const center = geometry.centers[idx];
  const top = center - thick / 2;
  const bottom = center + thick / 2;
  const w = proto.cheekWidth;
  const frontId = `front-${idx + 1}`;

  const returnFace: Face = {
    id: `stile-return-left-${idx + 1}`,
    fill: "#5a3420",
    points: [
      { x: innerLeft, y: top },
      { x: innerLeft + w, y: top },
      { x: innerLeft + w, y: bottom },
      { x: innerLeft, y: bottom },
    ],
  };

  const frontPos = faces.findIndex((face) => face.id === frontId);
  if (frontPos < 0) return [...faces, returnFace];
  return [...faces.slice(0, frontPos + 1), returnFace, ...faces.slice(frontPos + 1)];
}

/** 接触影・木口上端ハイライト（設計図⑤⑥）。横板ジオメトリは触らない。 */
function LeftJointEdgeMarks({
  geometry,
  proto,
}: {
  geometry: ShelfGeometry;
  proto: BoardJointShade;
}) {
  const idx = proto.boardIndex;
  const innerLeft = geometry.outerLeft + geometry.stile;
  const innerRight = geometry.outerRight - geometry.stile;
  const thick = geometry.front[idx];
  const center = geometry.centers[idx];
  const top = center - thick / 2;
  const bottom = center + thick / 2;
  const cheek = proto.cheekWidth;
  const meetX = innerLeft + cheek;
  const h = Math.max(0.5, bottom - top);

  return (
    <g aria-hidden="true" pointerEvents="none">
      {/* 側板正面→内側面の角ハイライト（ごく細い） */}
      <rect
        x={innerLeft - 0.45}
        y={top}
        width={0.45}
        height={h}
        fill="#f0d4aa"
        opacity={0.18}
      />
      {/* 内側面と木口の接触影 */}
      <rect x={meetX - 0.55} y={top} width={1.05} height={h} fill="#120a06" opacity={0.32} />
      <rect x={meetX + 0.35} y={top} width={0.7} height={h} fill="#1a100c" opacity={0.12} />
      {/* 上面が側板へ当たる水平の接触影 */}
      <rect
        x={meetX}
        y={top - 0.55}
        width={Math.min(18, innerRight - meetX)}
        height={0.65}
        fill="#120a06"
        opacity={0.2}
      />
      {/* 木口の手前上端ハイライト（設計図⑥） */}
      <line
        x1={meetX + 0.2}
        y1={top + 0.15}
        x2={innerRight - 1}
        y2={top + 0.15}
        stroke="#f5e0b8"
        strokeWidth={0.75}
        strokeLinecap="butt"
        opacity={0.38}
      />
    </g>
  );
}

function renderFace(face: Face, prefix: string, look: NaturalLook) {
  const points = pointsAttr(face.points);
  const grainFill =
    look === "ref-b" ? `url(#${prefix}-pat-warm-${face.id})` : `url(#${prefix}-pat-${face.id})`;
  return (
    <g key={face.id} clipPath={`url(#${prefix}-clip-${face.id})`}>
      <polygon points={points} fill={grainFill} stroke="none" />
      <polygon points={points} fill={`url(#${prefix}-light-${face.id})`} stroke="none" />
      {softJoints(face, look).map((joint, index) => (
        <line
          key={index}
          x1={joint.a.x}
          y1={joint.a.y}
          x2={joint.b.x}
          y2={joint.b.y}
          stroke="#2a160e"
          strokeWidth={joint.width}
          strokeLinecap="butt"
          opacity={joint.opacity}
          filter={`url(#${prefix}-soft)`}
        />
      ))}
    </g>
  );
}

export default function SvgShelfNatural({
  bayCount = 4,
  pitch,
  geometry: geometryProp,
  depth = NATURAL_DEPTH,
  look = "natural",
  layer = "all",
  between,
  afterFront,
  boardJointShade = null,
  className,
}: SvgShelfNaturalProps) {
  const geometry = geometryProp ?? shelfGeometryForBays(bayCount, pitch);
  const rawFaces = svgShelfFaces(depth, geometry);
  const allFaces = boardJointShade
    ? insertStileReturnOverlay(rawFaces, geometry, boardJointShade)
    : rawFaces;
  const sandwich = Boolean(between);
  const faces = sandwich
    ? allFaces
    : allFaces.filter((face) => layer === "all" || faceLayer(face.id) === layer);
  const backFaces = sandwich ? allFaces.filter((face) => faceLayer(face.id) === "back") : null;
  const frontBoardFaces = sandwich
    ? allFaces.filter(
        (face) => face.id.startsWith("front") || face.id.startsWith("stile-return"),
      )
    : null;
  const stileFaces = sandwich
    ? allFaces.filter((face) => face.id.startsWith("stile") && !face.id.startsWith("stile-return"))
    : null;
  const jointTag = boardJointShade
    ? `j${boardJointShade.boardIndex}-c${Math.round(boardJointShade.cheekWidth * 10)}`
    : "j0";
  const prefix = `shelf-natural-${Math.round(geometry.viewWidth)}x${Math.round(geometry.viewHeight)}-${look}-${sandwich ? "sandwich" : layer}-d${Math.round(depth.depthY * 1000)}-${Math.round(depth.depthX * 1000)}-e${Math.round(depth.eyeY ?? -1)}-${jointTag}`;

  return (
    <div className={className ?? styles.wrap}>
      <svg
        className={styles.shelf}
        viewBox={`0 0 ${geometry.viewWidth} ${geometry.viewHeight}`}
        role="img"
        aria-label="実物木目の空の棚。遠近を弱め、接合は線ではなく面の濃淡で示す。"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <filter id={`${prefix}-soft`} x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={isRefB(look) ? 0.7 : 0.55} />
          </filter>

          {look === "ref-b" && (
            <filter id={`${prefix}-warm`} colorInterpolationFilters="sRGB">
              {/* 均一ダーク茶 → 参考Bの温かみある赤茶系へ寄せる（テカテカは出さない） */}
              <feColorMatrix
                type="matrix"
                values="1.18 0.08 0.02 0 0.05 0.06 0.92 0.02 0 0.02 0.02 0.04 0.72 0 0.01 0 0 0 1 0"
              />
              <feComponentTransfer>
                <feFuncR type="gamma" amplitude="1" exponent="0.92" offset="0" />
                <feFuncG type="gamma" amplitude="1" exponent="0.96" offset="0" />
                <feFuncB type="gamma" amplitude="1" exponent="1.05" offset="0" />
              </feComponentTransfer>
            </filter>
          )}

          {faces.map((face) => {
            const kind = grainKind(face.id);
            const shift = shiftFor(face.id);
            const src = kind === "h" || face.id === "back" ? TEX_H : TEX_V;
            const tile = kind === "depth" ? 360 : 520;
            const tileH = kind === "depth" ? 160 : 520;
            return (
              <pattern
                key={`${face.id}-pat`}
                id={`${prefix}-pat-${face.id}`}
                patternUnits="userSpaceOnUse"
                x={shift}
                y={kind === "h" ? Math.floor(shift / 4) : Math.floor(shift / 5)}
                width={tile}
                height={tileH}
              >
                <image href={src} width={tile} height={tileH} preserveAspectRatio="none" />
              </pattern>
            );
          })}

          {look === "ref-b" &&
            faces.map((face) => {
              const kind = grainKind(face.id);
              const shift = shiftFor(face.id) + 17;
              const src = kind === "h" || face.id === "back" ? TEX_H : TEX_V;
              const tile = kind === "depth" ? 380 : 540;
              const tileH = kind === "depth" ? 170 : 540;
              return (
                <pattern
                  key={`${face.id}-pat-warm`}
                  id={`${prefix}-pat-warm-${face.id}`}
                  patternUnits="userSpaceOnUse"
                  x={shift}
                  y={kind === "h" ? Math.floor(shift / 3) : Math.floor(shift / 6)}
                  width={tile}
                  height={tileH}
                >
                  <image
                    href={src}
                    width={tile}
                    height={tileH}
                    preserveAspectRatio="none"
                    filter={`url(#${prefix}-warm)`}
                  />
                </pattern>
              );
            })}

          {faces.map((face) => (
            <LightOverlay key={`${face.id}-light`} face={face} prefix={prefix} look={look} />
          ))}

          {faces.map((face) => (
            <clipPath key={`${face.id}-clip`} id={`${prefix}-clip-${face.id}`}>
              <polygon points={pointsAttr(face.points)} />
            </clipPath>
          ))}
        </defs>

        {sandwich ? (
          <>
            {backFaces!.map((face) => renderFace(face, prefix, look))}
            {between}
            {/* 横板木口 → 内側面戻り → 接触影/ハイライト → 側板正面 */}
            {frontBoardFaces!.map((face) => renderFace(face, prefix, look))}
            {boardJointShade ? (
              <LeftJointEdgeMarks geometry={geometry} proto={boardJointShade} />
            ) : null}
            {stileFaces!.map((face) => renderFace(face, prefix, look))}
            {afterFront}
          </>
        ) : (
          <>
            {faces.map((face) => renderFace(face, prefix, look))}
            {afterFront}
          </>
        )}
      </svg>
    </div>
  );
}

function LightOverlay({
  face,
  prefix,
  look,
}: {
  face: Face;
  prefix: string;
  look: NaturalLook;
}) {
  const id = `${prefix}-light-${face.id}`;
  const xs = face.points.map((point) => point.x);
  const ys = face.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const warm = look === "ref-b";
  const prev = look === "ref-b-prev";
  const b = warm || prev;

  if (face.id === "back") {
    return (
      <radialGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        cx={midX}
        cy={midY * 0.92}
        r={Math.max(maxX - minX, maxY - minY) * (b ? 0.78 : 0.68)}
      >
        <stop
          offset="0%"
          stopColor={warm ? "#8a5a3a" : prev ? "#5a3a28" : "#7a4e30"}
          stopOpacity={warm ? 0.16 : prev ? 0.22 : 0.14}
        />
        <stop
          offset="50%"
          stopColor={warm ? "#4a2c1c" : prev ? "#2a1810" : "#3a2216"}
          stopOpacity={warm ? 0.28 : prev ? 0.38 : 0.22}
        />
        <stop
          offset="100%"
          stopColor={warm ? "#1a100c" : "#0c0806"}
          stopOpacity={warm ? 0.48 : prev ? 0.62 : 0.42}
        />
      </radialGradient>
    );
  }

  if (face.id.startsWith("under")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={midX} y1={minY} x2={midX} y2={maxY}>
        <stop
          offset="0%"
          stopColor={warm ? "#5a3420" : prev ? "#3a2418" : "#5a3824"}
          stopOpacity={warm ? 0.36 : prev ? 0.42 : 0.28}
        />
        <stop offset="100%" stopColor="#140a06" stopOpacity={warm ? 0.55 : prev ? 0.68 : 0.48} />
      </linearGradient>
    );
  }

  if (face.id.startsWith("deck")) {
    /**
     * ref-b: 上段の板ほど上面ハイライトを抑え、明るい水平帯を目立たせない。
     * ジオメトリ（投影）は変えず陰影のみ。deck-2/3=1–2段床、deck-4=3段、deck-5=最下。
     */
    const deckNo = Number(face.id.replace("deck-", "")) || 5;
    const refBScale =
      deckNo <= 3 ? { front: 0.02, mid: 0.2, back: 0.58 } :
      deckNo === 4 ? { front: 0.08, mid: 0.12, back: 0.42 } :
      { front: 0.16, mid: 0.08, back: 0.34 };
    const frontOp = warm ? refBScale.front : prev ? 0.18 : 0.1;
    const midOp = warm ? refBScale.mid : prev ? 0.08 : 0.14;
    const backOp = warm ? refBScale.back : prev ? 0.48 : 0.32;
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={midX} y1={maxY} x2={midX} y2={minY}>
        <stop
          offset="0%"
          stopColor={warm ? "#e8b878" : prev ? "#d4a06a" : "#c48a52"}
          stopOpacity={frontOp}
        />
        <stop
          offset="40%"
          stopColor={warm ? "#b07848" : prev ? "#8a5634" : "#6a4228"}
          stopOpacity={midOp}
        />
        <stop
          offset="100%"
          stopColor={warm ? "#3a2014" : prev ? "#1a0e08" : "#2a160e"}
          stopOpacity={backOp}
        />
      </linearGradient>
    );
  }

  if (face.id.startsWith("front")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={midX} y1={minY} x2={midX} y2={maxY}>
        <stop
          offset="0%"
          stopColor={warm ? "#f0c088" : prev ? "#e0a868" : "#c89860"}
          stopOpacity={warm ? 0.26 : prev ? 0.28 : 0.16}
        />
        <stop
          offset="16%"
          stopColor={warm ? "#c07840" : prev ? "#a06838" : "#8a5634"}
          stopOpacity={warm ? 0.04 : prev ? 0.06 : 0.04}
        />
        <stop
          offset="100%"
          stopColor={warm ? "#4a2818" : "#2a160e"}
          stopOpacity={warm ? 0.2 : prev ? 0.28 : 0.22}
        />
      </linearGradient>
    );
  }

  // 側板内縁の戻り面: 手前（側板）側はやや明るく、木口側へ暗く
  if (face.id.startsWith("stile-return")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop
          offset="0%"
          stopColor={warm ? "#c89860" : "#a07848"}
          stopOpacity={warm ? 0.2 : 0.16}
        />
        <stop
          offset="100%"
          stopColor={warm ? "#2a160e" : "#1a100c"}
          stopOpacity={warm ? 0.42 : 0.36}
        />
      </linearGradient>
    );
  }

  if (face.id === "stile-left") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop
          offset="0%"
          stopColor={warm ? "#d4a06a" : prev ? "#c89860" : "#b88858"}
          stopOpacity={warm ? 0.14 : prev ? 0.16 : 0.12}
        />
        <stop offset="100%" stopColor="#3a2216" stopOpacity={warm ? 0.18 : prev ? 0.22 : 0.16} />
      </linearGradient>
    );
  }

  if (face.id === "stile-right") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop offset="0%" stopColor={warm ? "#8a5634" : "#5a3824"} stopOpacity={warm ? 0.14 : prev ? 0.18 : 0.14} />
        <stop offset="100%" stopColor="#2a160e" stopOpacity={warm ? 0.28 : prev ? 0.36 : 0.28} />
      </linearGradient>
    );
  }

  if (face.id === "inner-left") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop
          offset="0%"
          stopColor={warm ? "#8a5634" : prev ? "#6a4028" : "#5a3824"}
          stopOpacity={warm ? 0.22 : prev ? 0.28 : 0.2}
        />
        <stop
          offset="55%"
          stopColor={warm ? "#3a2216" : prev ? "#2a1810" : "#3a2216"}
          stopOpacity={warm ? 0.28 : prev ? 0.36 : 0.28}
        />
        <stop offset="100%" stopColor="#140c08" stopOpacity={warm ? 0.44 : prev ? 0.58 : 0.42} />
      </linearGradient>
    );
  }

  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={maxX} y1={midY} x2={minX} y2={midY}>
      <stop
        offset="0%"
        stopColor={warm ? "#8a5634" : prev ? "#6a4028" : "#8a5634"}
        stopOpacity={warm ? 0.12 : prev ? 0.14 : 0.1}
      />
      <stop offset="55%" stopColor="#2a1810" stopOpacity={warm ? 0.26 : prev ? 0.32 : 0.22} />
      <stop offset="100%" stopColor="#140c08" stopOpacity={warm ? 0.4 : prev ? 0.52 : 0.36} />
    </linearGradient>
  );
}

/** 細い接触影だけ。輪郭としての輪線は描かない。 */
function softJoints(face: Face, look: NaturalLook) {
  const [a, b, c, d] = face.points;
  const boost = isRefB(look) ? 1.25 : 1;
  if (face.id === "under-1") {
    return [
      { a, b: d, opacity: 0.22 * boost, width: 2.8 },
      { a: b, b: c, opacity: 0.18 * boost, width: 2.6 },
      { a: d, b: c, opacity: 0.16 * boost, width: 2.2 },
    ];
  }
  if (face.id.startsWith("under") || face.id.startsWith("deck")) {
    return [
      { a, b: d, opacity: 0.14 * boost, width: 2.2 },
      { a: b, b: c, opacity: 0.12 * boost, width: 2 },
      { a: d, b: c, opacity: 0.12 * boost, width: 1.8 },
    ];
  }
  if (face.id === "inner-left" || face.id === "inner-right") {
    return [{ a: b, b: c, opacity: 0.14 * boost, width: 2.4 }];
  }
  if (isRefB(look) && face.id.startsWith("front")) {
    return [{ a, b, opacity: 0.18, width: 1.4 }];
  }
  if (face.id.startsWith("stile-return")) {
    return [
      { a, b, opacity: 0.14 * boost, width: 1 },
      { a: b, b: c, opacity: 0.2 * boost, width: 1.2 },
      { a: d, b: a, opacity: 0.12 * boost, width: 1 },
    ];
  }
  return [];
}
