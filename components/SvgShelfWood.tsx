import { svgShelfFaces } from "./SvgShelfFrame";
import styles from "./SvgShelfFrame.module.css";

/**
 * 保存版と同じ頂点・同じ描画順のまま、面の塗りと接合の陰影だけを変える。
 * 光源は左上前方。影は既存の面の内側に収める。
 */
const PREFIX = "shelf-wood";

type Face = ReturnType<typeof svgShelfFaces>[number];
type Point = Face["points"][number];

type Joint = { a: Point; b: Point; opacity: number };

function bounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function grainFor(id: string) {
  if (id === "back") return { href: `${PREFIX}-grain-back`, opacity: 0.22 };
  if (id.startsWith("under") || id.startsWith("deck")) return { href: `${PREFIX}-grain-depth`, opacity: 0.4 };
  if (id.startsWith("front")) return { href: `${PREFIX}-grain-h`, opacity: 0.36 };
  return { href: `${PREFIX}-grain-v`, opacity: id.startsWith("inner") ? 0.32 : 0.4 };
}

function jointsFor(face: Face): Joint[] {
  const [a, b, c, d] = face.points;
  if (face.id.startsWith("under") || face.id.startsWith("deck")) {
    const topJoint = face.id === "under-1";
    return [
      { a, b: d, opacity: topJoint ? 0.62 : 0.4 },
      { a: b, b: c, opacity: topJoint ? 0.55 : 0.34 },
      { a: d, b: c, opacity: 0.48 },
    ];
  }
  if (face.id.startsWith("front")) {
    return [
      { a, b: d, opacity: 0.2 },
      { a: b, b: c, opacity: 0.28 },
    ];
  }
  if (face.id === "inner-left" || face.id === "inner-right") {
    return [{ a: b, b: c, opacity: 0.4 }];
  }
  return [];
}

function FillGradient({ face }: { face: Face }) {
  const id = `${PREFIX}-fill-${face.id}`;
  const box = bounds(face.points);
  const [first, second, third, fourth] = face.points;

  if (face.id === "back") {
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const radius = Math.max(box.maxX - box.minX, box.maxY - box.minY) / 2;
    return (
      <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={radius}>
        <stop offset="0%" stopColor="#f6e7d0" />
        <stop offset="58%" stopColor="#e7d0ae" />
        <stop offset="100%" stopColor="#c9ae86" />
      </radialGradient>
    );
  }

  if (face.id.startsWith("under")) {
    return (
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={first.x}
        y1={first.y}
        x2={fourth.x}
        y2={fourth.y}
      >
        <stop offset="0%" stopColor="#d7b07a" />
        <stop offset="84%" stopColor="#c49662" />
        <stop offset="100%" stopColor="#9a6844" />
      </linearGradient>
    );
  }

  if (face.id.startsWith("deck")) {
    return (
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={first.x}
        y1={first.y}
        x2={fourth.x}
        y2={fourth.y}
      >
        <stop offset="0%" stopColor="#f8e8ce" />
        <stop offset="86%" stopColor="#f1dcc0" />
        <stop offset="100%" stopColor="#d2b48c" />
      </linearGradient>
    );
  }

  if (face.id.startsWith("front")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={box.minX} y1={box.minY} x2={box.minX} y2={box.maxY}>
        <stop offset="0%" stopColor="#f3e0c2" />
        <stop offset="28%" stopColor="#e7c99c" />
        <stop offset="100%" stopColor="#ddc093" />
      </linearGradient>
    );
  }

  if (face.id === "stile-left") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={box.minX} y1={box.minY} x2={box.maxX} y2={box.minY}>
        <stop offset="0%" stopColor="#f7e7d0" />
        <stop offset="100%" stopColor="#ecd6b4" />
      </linearGradient>
    );
  }

  if (face.id === "stile-right") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={box.minX} y1={box.minY} x2={box.maxX} y2={box.minY}>
        <stop offset="0%" stopColor="#ead2b0" />
        <stop offset="100%" stopColor="#dcc096" />
      </linearGradient>
    );
  }

  const towardBack = face.id === "inner-left";
  return (
    <linearGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      x1={first.x}
      y1={(first.y + fourth.y) / 2}
      x2={second.x}
      y2={(second.y + third.y) / 2}
    >
      <stop offset="0%" stopColor={towardBack ? "#d2b48c" : "#e7d0ae"} />
      <stop offset="78%" stopColor={towardBack ? "#c4a074" : "#d8bc96"} />
      <stop offset="100%" stopColor={towardBack ? "#a88460" : "#c6a478"} />
    </linearGradient>
  );
}

export default function SvgShelfWood() {
  const faces = svgShelfFaces();

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.shelf}
        viewBox="0 0 1000 700"
        role="img"
        aria-label="明るいオーク材の空の木製棚。保存版と同じ骨格に、木目と接合部の陰影を加えたもの。"
      >
        <defs>
          <pattern id={`${PREFIX}-grain-h`} width="240" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 5 C46 4, 92 6.2, 150 5 S210 4.2, 240 5.4" stroke="#7a5230" strokeWidth="0.45" fill="none" opacity="0.34" />
            <path d="M0 12 C58 13, 110 10.6, 168 12.2 S214 13, 240 11.4" stroke="#fff8ee" strokeWidth="0.4" fill="none" opacity="0.4" />
          </pattern>
          <pattern id={`${PREFIX}-grain-v`} width="18" height="220" patternUnits="userSpaceOnUse">
            <path d="M5 0 C4.2 48, 6.2 96, 5 150 S4.4 190, 5.6 220" stroke="#7a5230" strokeWidth="0.45" fill="none" opacity="0.32" />
            <path d="M12 0 C12.8 54, 10.6 112, 12.4 166 S13 198, 11.2 220" stroke="#fff8ee" strokeWidth="0.4" fill="none" opacity="0.36" />
          </pattern>
          <pattern id={`${PREFIX}-grain-depth`} width="14" height="180" patternUnits="userSpaceOnUse">
            <path d="M4 0 C3.4 40, 5 92, 4.2 140 S3.6 168, 4.6 180" stroke="#8a5a34" strokeWidth="0.4" fill="none" opacity="0.3" />
            <path d="M10 0 C10.6 36, 9 88, 10.4 132 S11 164, 9.6 180" stroke="#fff6e8" strokeWidth="0.35" fill="none" opacity="0.38" />
          </pattern>
          <pattern id={`${PREFIX}-grain-back`} width="280" height="36" patternUnits="userSpaceOnUse">
            <path d="M0 14 C70 13, 140 16, 210 14.4 S260 13, 280 15" stroke="#8a6240" strokeWidth="0.4" fill="none" opacity="0.22" />
            <path d="M0 26 H280" stroke="#fff8ee" strokeWidth="0.3" fill="none" opacity="0.18" />
          </pattern>
          {faces.map((face) => (
            <FillGradient key={face.id} face={face} />
          ))}
          {faces.map((face) => (
            <clipPath key={`${face.id}-clip`} id={`${PREFIX}-clip-${face.id}`}>
              <polygon points={face.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")} />
            </clipPath>
          ))}
        </defs>
        {faces.map((face) => {
          const points = face.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
          const grain = grainFor(face.id);
          return (
            <g key={face.id} clipPath={`url(#${PREFIX}-clip-${face.id})`}>
              <polygon points={points} fill={`url(#${PREFIX}-fill-${face.id})`} stroke="none" />
              <polygon points={points} fill={`url(#${grain.href})`} opacity={grain.opacity} stroke="none" />
              {jointsFor(face).map((joint, index) => (
                <line
                  key={index}
                  x1={joint.a.x}
                  y1={joint.a.y}
                  x2={joint.b.x}
                  y2={joint.b.y}
                  stroke="#6a432c"
                  strokeWidth={2.4}
                  strokeLinecap="butt"
                  opacity={joint.opacity}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
