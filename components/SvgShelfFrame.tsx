import styles from "./SvgShelfFrame.module.css";

/**
 * 空の木製棚。正面は長方形のまま、奥行きだけを一つの視点へ寄せる。
 * 目の高さは中央の板。上の板は下面、下の板は上面が、距離に応じて見える。
 */
const SHELF = {
  viewWidth: 1000,
  viewHeight: 700,
  outerLeft: 16,
  outerRight: 984,
  stile: 42,
  centers: [46, 198, 350, 502, 654],
  front: [20, 16, 16, 16, 18],
  depthY: 0.24,
  depthX: 0.06,
  pitch: 152,
} as const;

const WOOD = {
  back: "#d9bc96",
  innerLeft: "#c9a06e",
  innerRight: "#c09568",
  under: "#b68352",
  deck: "#f4e2c2",
  front: "#e7c99b",
  frontTop: "#f0d4aa",
  frontBottom: "#e3c396",
  stileLeft: "#f1d8b2",
  stileRight: "#e4c296",
  edge: "#9a7048",
} as const;

type Point = { x: number; y: number };

type Face = {
  id: string;
  points: Point[];
  fill: string;
};

export type ShelfDepth = {
  depthY?: number;
  depthX?: number;
  /** 省略時は中央板の高さ。B再現など見下ろし視点では小さい y を渡す。 */
  eyeY?: number;
};

export type ShelfGeometry = {
  viewWidth: number;
  viewHeight: number;
  outerLeft: number;
  outerRight: number;
  stile: number;
  centers: number[];
  front: number[];
};

const DEFAULT_GEOMETRY: ShelfGeometry = {
  viewWidth: SHELF.viewWidth,
  viewHeight: SHELF.viewHeight,
  outerLeft: SHELF.outerLeft,
  outerRight: SHELF.outerRight,
  stile: SHELF.stile,
  centers: [...SHELF.centers],
  front: [...SHELF.front],
};

/** 収納段数から実験用の骨格を作る。4段かつ既定 pitch のときだけ保存版座標。 */
export function shelfGeometryForBays(bayCount: number, pitch: number = SHELF.pitch): ShelfGeometry {
  const count = Math.max(1, Math.round(bayCount));
  const step = Math.max(120, pitch);
  if (count === 4 && step === SHELF.pitch) return DEFAULT_GEOMETRY;
  const boardCount = count + 1;
  const centers = Array.from({ length: boardCount }, (_, index) => SHELF.centers[0] + index * step);
  const front = centers.map((_, index) => {
    if (index === 0) return 20;
    if (index === boardCount - 1) return 18;
    return 16;
  });
  const viewHeight = centers[boardCount - 1] + front[boardCount - 1] / 2 + 16;
  return {
    viewWidth: SHELF.viewWidth,
    viewHeight,
    outerLeft: SHELF.outerLeft,
    outerRight: SHELF.outerRight,
    stile: SHELF.stile,
    centers,
    front,
  };
}

export type WorksShelfLayoutInput = {
  /** 各段の「作品が占める高さ」（棚板間の内寸。上面接地＋わずかな頭上余裕込み） */
  bayClears: number[];
  viewWidth?: number;
  stile?: number;
  outerPad?: number;
  topMargin?: number;
  bottomMargin?: number;
  boardThickness?: number;
};

/**
 * 作品の配置可能高さを先に決め、そこから棚板中心・viewBox を組み立てる。
 * 固定の保存版座標には押し込まない（作品配置実験専用）。
 */
export function shelfGeometryFromBayClears(input: WorksShelfLayoutInput): ShelfGeometry {
  const bayClears = input.bayClears.map((h) => Math.max(48, h));
  const bayCount = Math.max(1, bayClears.length);
  const boardCount = bayCount + 1;
  const viewWidth = input.viewWidth ?? 960;
  const stile = input.stile ?? 38;
  const outerPad = input.outerPad ?? 14;
  const topMargin = input.topMargin ?? 26;
  const bottomMargin = input.bottomMargin ?? 22;
  const midThick = input.boardThickness ?? 14;
  const front = Array.from({ length: boardCount }, (_, index) => {
    if (index === 0) return midThick + 4;
    if (index === boardCount - 1) return midThick + 2;
    return midThick;
  });

  const centers: number[] = [];
  let y = topMargin + front[0] / 2;
  centers.push(y);
  for (let i = 0; i < bayCount; i += 1) {
    y += front[i] / 2 + bayClears[i] + front[i + 1] / 2;
    centers.push(y);
  }

  const viewHeight = centers[boardCount - 1] + front[boardCount - 1] / 2 + bottomMargin;
  return {
    viewWidth,
    viewHeight,
    outerLeft: outerPad,
    outerRight: viewWidth - outerPad,
    stile,
    centers,
    front,
  };
}

export const SHELF_INNER_WIDTH =
  SHELF.outerRight - SHELF.stile - (SHELF.outerLeft + SHELF.stile);

function metrics(geometry: ShelfGeometry, depth?: ShelfDepth) {
  const innerLeft = geometry.outerLeft + geometry.stile;
  const innerRight = geometry.outerRight - geometry.stile;
  const eyeX = (innerLeft + innerRight) / 2;
  const eyeY =
    depth?.eyeY ??
    geometry.centers[Math.floor((geometry.centers.length - 1) / 2)] ??
    geometry.centers[0];
  return { innerLeft, innerRight, eyeX, eyeY };
}

function project(
  point: Point,
  depthY: number,
  depthX: number,
  eyeX: number,
  eyeY: number,
): Point {
  return {
    x: point.x + (eyeX - point.x) * depthX,
    y: point.y + (eyeY - point.y) * depthY,
  };
}

function pointsAttr(points: Point[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function boardFront(geometry: ShelfGeometry, index: number) {
  const center = geometry.centers[index];
  const thick = geometry.front[index];
  return { top: center - thick / 2, bottom: center + thick / 2 };
}

/**
 * 作品を置く段の天井・床。viewBox 座標。
 * sitY は床板の「上面」の前端（正面の上辺）。正面や下面ではない。
 */
export function svgShelfBays(depth?: ShelfDepth, geometry: ShelfGeometry = DEFAULT_GEOMETRY) {
  const depthY = depth?.depthY ?? SHELF.depthY;
  const depthX = depth?.depthX ?? SHELF.depthX;
  const { innerLeft, innerRight, eyeX, eyeY } = metrics(geometry, depth);
  const clearance = 2;
  const bays = geometry.centers.slice(0, -1).map((center, index) => {
    const ceiling = boardFront(geometry, index);
    const floor = boardFront(geometry, index + 1);
    const ceilingAboveEye = center < eyeY - 0.5;
    const floorBelowEye = geometry.centers[index + 1] > eyeY + 0.5;
    // 上の板の下面が見える段は、下面の奥端より下を天井にする
    const ceilingY = ceilingAboveEye
      ? project({ x: innerLeft, y: ceiling.bottom }, depthY, depthX, eyeX, eyeY).y
      : ceiling.bottom;
    // 上面の手前辺（正面の上辺）。下面・正面の中央ではない
    const deckFrontY = floor.top;
    const deckDepth = floorBelowEye
      ? Math.abs(
          project({ x: innerLeft, y: floor.top }, depthY, depthX, eyeX, eyeY).y - floor.top,
        )
      : 0;
    /**
     * 接地は上面。下段で上面が見えるときは、手前木口よりわずかに奥へ置き、
     * 正面と作品が同一平面で重ならないようにする（隙間ではなく上面の奥行き）。
     */
    const sitInset = floorBelowEye ? Math.min(Math.max(2, deckDepth * 0.22), deckDepth * 0.45) : 0;
    const sitY = deckFrontY - sitInset;
    return {
      index,
      ceilingY,
      sitY,
      deckFrontY,
      deckDepth,
      floorFrontBottom: floor.bottom,
      maxHeight: Math.max(40, sitY - ceilingY - clearance),
      innerLeft,
      innerRight,
    };
  });
  return {
    viewWidth: geometry.viewWidth,
    viewHeight: geometry.viewHeight,
    innerLeft,
    innerRight,
    bays,
    geometry,
  };
}

/** 省略時は保存版と同じ奥行き・4段。 */
export function svgShelfFaces(depth?: ShelfDepth, geometry: ShelfGeometry = DEFAULT_GEOMETRY): Face[] {
  const depthY = depth?.depthY ?? SHELF.depthY;
  const depthX = depth?.depthX ?? SHELF.depthX;
  const { innerLeft, innerRight, eyeX, eyeY } = metrics(geometry, depth);
  const top = boardFront(geometry, 0);
  const bottom = boardFront(geometry, geometry.centers.length - 1);
  const faces: Face[] = [];

  const backTopLeft = project({ x: innerLeft, y: top.bottom }, depthY, depthX, eyeX, eyeY);
  const backTopRight = project({ x: innerRight, y: top.bottom }, depthY, depthX, eyeX, eyeY);
  const backBottomRight = project({ x: innerRight, y: bottom.top }, depthY, depthX, eyeX, eyeY);
  const backBottomLeft = project({ x: innerLeft, y: bottom.top }, depthY, depthX, eyeX, eyeY);

  faces.push({
    id: "back",
    fill: WOOD.back,
    points: [backTopLeft, backTopRight, backBottomRight, backBottomLeft],
  });

  faces.push({
    id: "inner-left",
    fill: WOOD.innerLeft,
    points: [
      { x: innerLeft, y: top.bottom },
      backTopLeft,
      backBottomLeft,
      { x: innerLeft, y: bottom.top },
    ],
  });
  faces.push({
    id: "inner-right",
    fill: WOOD.innerRight,
    points: [
      { x: innerRight, y: top.bottom },
      backTopRight,
      backBottomRight,
      { x: innerRight, y: bottom.top },
    ],
  });

  geometry.centers.forEach((center, index) => {
    const front = boardFront(geometry, index);
    const aboveEye = center < eyeY - 0.5;
    const belowEye = center > eyeY + 0.5;
    const nearY = aboveEye ? front.bottom : front.top;
    const nearLeft = { x: innerLeft, y: nearY };
    const nearRight = { x: innerRight, y: nearY };
    const farLeft = project(nearLeft, depthY, depthX, eyeX, eyeY);
    const farRight = project(nearRight, depthY, depthX, eyeX, eyeY);
    const depthAmount = Math.abs(farLeft.y - nearY);

    // 薄い木口＋見下ろし視点では 1.2px 程度の上面も描く（B実測の上段上面）
    if ((aboveEye || belowEye) && depthAmount >= 1.2) {
      faces.push({
        id: aboveEye ? `under-${index + 1}` : `deck-${index + 1}`,
        fill: aboveEye ? WOOD.under : WOOD.deck,
        points: [nearLeft, nearRight, farRight, farLeft],
      });
    }

    const frontFill =
      index === 0
        ? WOOD.frontTop
        : index === geometry.centers.length - 1
          ? WOOD.frontBottom
          : WOOD.front;
    faces.push({
      id: `front-${index + 1}`,
      fill: frontFill,
      points: [
        { x: innerLeft, y: front.top },
        { x: innerRight, y: front.top },
        { x: innerRight, y: front.bottom },
        { x: innerLeft, y: front.bottom },
      ],
    });
  });

  const stileTop = top.top;
  const stileBottom = bottom.bottom;
  faces.push({
    id: "stile-left",
    fill: WOOD.stileLeft,
    points: [
      { x: geometry.outerLeft, y: stileTop },
      { x: innerLeft, y: stileTop },
      { x: innerLeft, y: stileBottom },
      { x: geometry.outerLeft, y: stileBottom },
    ],
  });
  faces.push({
    id: "stile-right",
    fill: WOOD.stileRight,
    points: [
      { x: innerRight, y: stileTop },
      { x: geometry.outerRight, y: stileTop },
      { x: geometry.outerRight, y: stileBottom },
      { x: innerRight, y: stileBottom },
    ],
  });

  return faces;
}

export default function SvgShelfFrame() {
  const faces = svgShelfFaces();

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.shelf}
        viewBox={`0 0 ${SHELF.viewWidth} ${SHELF.viewHeight}`}
        role="img"
        aria-label="空の木製棚。中央を目の高さにして、上の板は下面、下の板は上面が見える。"
      >
        {faces.map((face) => (
          <polygon
            key={face.id}
            points={pointsAttr(face.points)}
            fill={face.fill}
            stroke={WOOD.edge}
            strokeWidth={1.4}
            strokeLinejoin="miter"
          />
        ))}
      </svg>
    </div>
  );
}
