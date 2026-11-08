import { svgShelfFaces } from "./SvgShelfFrame";
import styles from "./SvgShelfFrame.module.css";

/**
 * 保存版と同じ頂点。実物の木材写真（ambientCG Wood027 / CC0）を面ごとに貼る。
 * 横板前面は横目、側板は縦目。上に薄い光の層だけ重ねる。
 */
const PREFIX = "shelf-grain";
const TEX_H = "/textures/wood/wood027-color.jpg";
const TEX_V = "/textures/wood/wood027-color-v.jpg";

type Face = ReturnType<typeof svgShelfFaces>[number];
type Point = Face["points"][number];

const SHIFT: Record<string, number> = {
  "front-1": 0,
  "front-2": 120,
  "front-3": 240,
  "front-4": 60,
  "front-5": 180,
  "under-1": 40,
  "under-2": 160,
  "deck-4": 90,
  "deck-5": 20,
  "stile-left": 0,
  "stile-right": 80,
  "inner-left": 30,
  "inner-right": 110,
  back: 50,
};

function pointsAttr(points: Point[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function grainKind(id: string): "h" | "v" | "depth" {
  if (id.startsWith("under") || id.startsWith("deck")) return "depth";
  if (id.startsWith("front") || id === "back") return "h";
  return "v";
}

export default function SvgShelfGrain() {
  const faces = svgShelfFaces();

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.shelf}
        viewBox="0 0 1000 700"
        role="img"
        aria-label="実物の木目写真を貼った空の木製棚。保存版と同じ骨格で、B参考のシックな色に寄せたもの。"
      >
        <defs>
          {faces.map((face) => {
            const kind = grainKind(face.id);
            const shift = SHIFT[face.id] ?? 0;
            const src = kind === "h" || face.id === "back" ? TEX_H : TEX_V;
            const tile = kind === "depth" ? 320 : 480;
            const tileH = kind === "depth" ? 200 : 480;
            return (
              <pattern
                key={`${face.id}-pat`}
                id={`${PREFIX}-pat-${face.id}`}
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

          {faces.map((face) => (
            <LightOverlay key={`${face.id}-light`} face={face} />
          ))}

          {faces.map((face) => (
            <clipPath key={`${face.id}-clip`} id={`${PREFIX}-clip-${face.id}`}>
              <polygon points={pointsAttr(face.points)} />
            </clipPath>
          ))}
        </defs>

        {faces.map((face) => {
          const points = pointsAttr(face.points);
          return (
            <g key={face.id} clipPath={`url(#${PREFIX}-clip-${face.id})`}>
              <polygon points={points} fill={`url(#${PREFIX}-pat-${face.id})`} stroke="none" />
              <polygon points={points} fill={`url(#${PREFIX}-light-${face.id})`} stroke="none" />
              {jointLines(face).map((joint, index) => (
                <line
                  key={index}
                  x1={joint.a.x}
                  y1={joint.a.y}
                  x2={joint.b.x}
                  y2={joint.b.y}
                  stroke="#1a0c06"
                  strokeWidth={joint.width}
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

function LightOverlay({ face }: { face: Face }) {
  const id = `${PREFIX}-light-${face.id}`;
  const xs = face.points.map((point) => point.x);
  const ys = face.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  if (face.id === "back") {
    return (
      <radialGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        cx={midX - (maxX - minX) * 0.05}
        cy={midY}
        r={Math.max(maxX - minX, maxY - minY) * 0.62}
      >
        <stop offset="0%" stopColor="#8a5a34" stopOpacity="0.18" />
        <stop offset="50%" stopColor="#3a2216" stopOpacity="0.28" />
        <stop offset="100%" stopColor="#100806" stopOpacity="0.55" />
      </radialGradient>
    );
  }

  if (face.id.startsWith("under")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={midX} y1={minY} x2={midX} y2={maxY}>
        <stop offset="0%" stopColor="#5a3824" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#120806" stopOpacity="0.62" />
      </linearGradient>
    );
  }

  if (face.id.startsWith("deck")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={midX} y1={maxY} x2={midX} y2={minY}>
        <stop offset="0%" stopColor="#c48a52" stopOpacity="0.12" />
        <stop offset="70%" stopColor="#6a4228" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#2a160e" stopOpacity="0.4" />
      </linearGradient>
    );
  }

  if (face.id.startsWith("front")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={midX} y1={minY} x2={midX} y2={maxY}>
        <stop offset="0%" stopColor="#d4a06a" stopOpacity="0.28" />
        <stop offset="22%" stopColor="#8a5634" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#2a160e" stopOpacity="0.32" />
      </linearGradient>
    );
  }

  if (face.id === "stile-left") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop offset="0%" stopColor="#c48a52" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#3a2216" stopOpacity="0.22" />
      </linearGradient>
    );
  }

  if (face.id === "stile-right") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop offset="0%" stopColor="#5a3824" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#2a160e" stopOpacity="0.36" />
      </linearGradient>
    );
  }

  if (face.id === "inner-left") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop offset="0%" stopColor="#5a3824" stopOpacity="0.28" />
        <stop offset="100%" stopColor="#100806" stopOpacity="0.55" />
      </linearGradient>
    );
  }

  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={maxX} y1={midY} x2={minX} y2={midY}>
      <stop offset="0%" stopColor="#8a5634" stopOpacity="0.14" />
      <stop offset="100%" stopColor="#1a0c06" stopOpacity="0.48" />
    </linearGradient>
  );
}

function jointLines(face: Face) {
  const [a, b, c, d] = face.points;
  if (face.id.startsWith("under") || face.id.startsWith("deck")) {
    const top = face.id === "under-1";
    return [
      { a, b: d, opacity: top ? 0.45 : 0.3, width: 2.4 },
      { a: b, b: c, opacity: top ? 0.38 : 0.26, width: 2.2 },
      { a: d, b: c, opacity: 0.34, width: 2 },
    ];
  }
  if (face.id.startsWith("front")) {
    return [
      { a, b: d, opacity: 0.18, width: 1.6 },
      { a: b, b: c, opacity: 0.24, width: 1.6 },
    ];
  }
  if (face.id === "inner-left" || face.id === "inner-right") {
    return [{ a: b, b: c, opacity: 0.3, width: 2 }];
  }
  return [];
}
