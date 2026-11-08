import { svgShelfFaces } from "./SvgShelfFrame";
import styles from "./SvgShelfFrame.module.css";

/**
 * 参考画像B「暗めウッド（シック）」の質感。骨格は svgShelfFaces() のまま。
 * 色は深みのある赤み茶色。背板は周辺が暗く中央に反射。前面に薄い光沢。
 */
const PREFIX = "shelf-chic";

type Face = ReturnType<typeof svgShelfFaces>[number];
type Point = Face["points"][number];

const SHIFT: Record<string, number> = {
  "front-1": 4,
  "front-2": 19,
  "front-3": 37,
  "front-4": 12,
  "front-5": 28,
  "under-1": 8,
  "under-2": 24,
  "deck-4": 15,
  "deck-5": 3,
  "stile-left": 0,
  "stile-right": 14,
  "inner-left": 6,
  "inner-right": 20,
};

function pointsAttr(points: Point[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function grainKind(id: string) {
  if (id === "back") return "back";
  if (id.startsWith("under") || id.startsWith("deck")) return "depth";
  if (id.startsWith("front")) return "h";
  return "v";
}

function grainOpacity(id: string) {
  if (id === "back") return 0.28;
  if (id.startsWith("under")) return 0.34;
  if (id.startsWith("deck")) return 0.4;
  if (id.startsWith("inner")) return 0.3;
  if (id.startsWith("stile")) return 0.42;
  return 0.5;
}

export default function SvgShelfChic() {
  const faces = svgShelfFaces();

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.shelf}
        viewBox="0 0 1000 700"
        role="img"
        aria-label="暗めのシックな木製棚。参考画像Bの落ち着いた茶色と奥の陰影を、保存版と同じ骨格で再現したもの。"
      >
        <defs>
          <filter id={`${PREFIX}-soft`} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.35" />
          </filter>

          <g id={`${PREFIX}-src-h`}>
            <path d="M0 5 C80 3, 160 9, 280 5 S430 1, 560 8 S720 12, 860 4 S920 6, 920 6" stroke="#1a0c06" strokeWidth="0.9" fill="none" opacity="0.55" />
            <path d="M0 14 C95 18, 200 11, 340 16 S520 22, 700 13 S840 10, 920 17" stroke="#3a2014" strokeWidth="0.45" fill="none" opacity="0.4" />
            <path d="M10 24 C130 20, 250 30, 420 23 S640 18, 920 28" stroke="#8a5a34" strokeWidth="0.35" fill="none" opacity="0.18" />
            <path d="M0 36 C110 41, 240 33, 390 40 S620 46, 820 35 S900 38, 920 42" stroke="#2a160e" strokeWidth="0.7" fill="none" opacity="0.45" />
            <path d="M0 48 C150 45, 300 54, 500 47 S740 42, 920 52" stroke="#5a3220" strokeWidth="0.4" fill="none" opacity="0.3" />
            <path d="M0 60 C120 64, 280 56, 460 62 S700 68, 920 58" stroke="#1e1008" strokeWidth="0.55" fill="none" opacity="0.35" />
          </g>
          <g id={`${PREFIX}-src-v`}>
            <path d="M5 0 C3 90, 8 180, 4 300 S2 440, 6 580 S4 660, 5 700" stroke="#1a0c06" strokeWidth="0.85" fill="none" opacity="0.5" />
            <path d="M14 0 C16 80, 11 200, 15 330 S18 470, 12 600 S14 660, 13 700" stroke="#3a2014" strokeWidth="0.4" fill="none" opacity="0.35" />
            <path d="M24 0 C22 110, 27 240, 23 390 S20 520, 26 700" stroke="#8a5a34" strokeWidth="0.35" fill="none" opacity="0.14" />
            <path d="M33 0 C35 100, 30 220, 34 370 S37 510, 31 700" stroke="#2a160e" strokeWidth="0.55" fill="none" opacity="0.4" />
            <path d="M42 0 C40 70, 45 190, 41 340 S38 480, 43 700" stroke="#5a3220" strokeWidth="0.35" fill="none" opacity="0.28" />
          </g>
          <g id={`${PREFIX}-src-depth`}>
            <path d="M3 0 C2 45, 6 95, 3 155 S1 200, 4 240" stroke="#1a0c06" strokeWidth="0.7" fill="none" opacity="0.4" />
            <path d="M12 0 C14 40, 9 95, 13 150 S15 205, 11 240" stroke="#8a5a34" strokeWidth="0.3" fill="none" opacity="0.12" />
            <path d="M21 0 C19 55, 24 115, 20 175 S18 215, 22 240" stroke="#2a160e" strokeWidth="0.5" fill="none" opacity="0.35" />
            <path d="M30 0 C32 30, 27 100, 31 165 S33 215, 29 240" stroke="#5a3220" strokeWidth="0.35" fill="none" opacity="0.25" />
          </g>
          <g id={`${PREFIX}-src-back`}>
            <path d="M60 40 C170 90, 230 200, 180 340 S140 520, 200 640" stroke="#1a0c06" strokeWidth="1.2" fill="none" opacity="0.22" />
            <path d="M200 20 C330 90, 390 210, 320 370 S270 550, 350 650" stroke="#2a160e" strokeWidth="0.7" fill="none" opacity="0.18" />
            <path d="M380 30 C490 100, 550 220, 460 390 S410 560, 510 650" stroke="#8a5a34" strokeWidth="0.45" fill="none" opacity="0.12" />
            <path d="M30 200 C150 180, 290 230, 450 195 S690 170, 850 210" stroke="#1e1008" strokeWidth="0.4" fill="none" opacity="0.14" />
            <path d="M40 440 C190 420, 350 470, 530 435 S750 410, 860 450" stroke="#2a160e" strokeWidth="0.35" fill="none" opacity="0.12" />
          </g>

          {faces.map((face) => {
            const kind = grainKind(face.id);
            const shift = SHIFT[face.id] ?? 0;
            return (
              <pattern
                key={`${face.id}-grain`}
                id={`${PREFIX}-grain-${face.id}`}
                patternUnits="userSpaceOnUse"
                x={kind === "v" || kind === "depth" ? shift : 0}
                y={kind === "h" || kind === "depth" ? shift : 0}
                width={kind === "h" ? 920 : kind === "v" ? 50 : kind === "depth" ? 42 : 900}
                height={kind === "h" ? 72 : kind === "v" ? 700 : kind === "depth" ? 240 : 660}
              >
                <use href={`#${PREFIX}-src-${kind}`} />
              </pattern>
            );
          })}

          {faces.map((face) => (
            <FaceDefs key={`${face.id}-defs`} face={face} />
          ))}

          {faces.map((face) => (
            <clipPath key={`${face.id}-clip`} id={`${PREFIX}-clip-${face.id}`}>
              <polygon points={pointsAttr(face.points)} />
            </clipPath>
          ))}
        </defs>

        {faces.map((face) => {
          const points = pointsAttr(face.points);
          const isFront = face.id.startsWith("front");
          return (
            <g key={face.id} clipPath={`url(#${PREFIX}-clip-${face.id})`}>
              <polygon points={points} fill={`url(#${PREFIX}-fill-${face.id})`} stroke="none" />
              <polygon points={points} fill={`url(#${PREFIX}-grain-${face.id})`} opacity={grainOpacity(face.id)} stroke="none" />
              {hasShade(face.id) && (
                <polygon points={points} fill={`url(#${PREFIX}-shade-${face.id})`} stroke="none" />
              )}
              {isFront && (
                <polygon points={points} fill={`url(#${PREFIX}-sheen-${face.id})`} stroke="none" />
              )}
              {jointLines(face).map((joint, index) => (
                <line
                  key={index}
                  x1={joint.a.x}
                  y1={joint.a.y}
                  x2={joint.b.x}
                  y2={joint.b.y}
                  stroke="#120806"
                  strokeWidth={joint.width}
                  strokeLinecap="butt"
                  opacity={joint.opacity}
                  filter={`url(#${PREFIX}-soft)`}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FaceDefs({ face }: { face: Face }) {
  const xs = face.points.map((point) => point.x);
  const ys = face.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const [from, mid, to] = fillStops(face.id);
  const deck = face.id.startsWith("deck");
  const under = face.id.startsWith("under");
  const front = face.id.startsWith("front");
  const vertical = face.id === "back" || front || under || deck;

  return (
    <>
      {face.id === "back" ? (
        <radialGradient
          id={`${PREFIX}-fill-${face.id}`}
          gradientUnits="userSpaceOnUse"
          cx={midX - (maxX - minX) * 0.08}
          cy={midY - (maxY - minY) * 0.05}
          r={Math.max(maxX - minX, maxY - minY) * 0.62}
        >
          <stop offset="0%" stopColor="#5a3828" />
          <stop offset="42%" stopColor="#3c2418" />
          <stop offset="100%" stopColor="#140c08" />
        </radialGradient>
      ) : (
        <linearGradient
          id={`${PREFIX}-fill-${face.id}`}
          gradientUnits="userSpaceOnUse"
          x1={vertical ? midX : face.id === "inner-right" || face.id === "stile-right" ? maxX : minX}
          y1={deck ? maxY : under ? minY : vertical ? minY : midY}
          x2={vertical ? midX : face.id === "inner-right" || face.id === "stile-right" ? minX : maxX}
          y2={deck ? minY : under ? maxY : vertical ? maxY : midY}
        >
          <stop offset="0%" stopColor={from} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      )}

      {front && (
        <linearGradient
          id={`${PREFIX}-sheen-${face.id}`}
          gradientUnits="userSpaceOnUse"
          x1={midX}
          y1={minY}
          x2={midX}
          y2={maxY}
        >
          <stop offset="0%" stopColor="#b88858" stopOpacity="0.22" />
          <stop offset="14%" stopColor="#b88858" stopOpacity="0.05" />
          <stop offset="70%" stopColor="#120806" stopOpacity="0" />
          <stop offset="100%" stopColor="#120806" stopOpacity="0.34" />
        </linearGradient>
      )}

      {shadeGradient(face, minX, maxX, minY, maxY)}
    </>
  );
}

/** 参考Bの実測に近い深みのある茶色。前面・上面・下面で明度を分ける。 */
function fillStops(id: string): [string, string, string] {
  const table: Record<string, [string, string, string]> = {
    "front-1": ["#6e4228", "#54301c", "#3e2214"],
    "front-2": ["#643c24", "#4c2c1a", "#382014"],
    "front-3": ["#5e3a22", "#482818", "#341c12"],
    "front-4": ["#5a3620", "#442616", "#301a10"],
    "front-5": ["#54321e", "#402414", "#2c180e"],
    "under-1": ["#2a160e", "#1a0e08", "#0e0804"],
    "under-2": ["#322016", "#22140c", "#140c08"],
    "deck-4": ["#7a4e30", "#5e3a24", "#44281a"],
    "deck-5": ["#865634", "#664028", "#4a2c1c"],
    "stile-left": ["#6e4228", "#54301c", "#3e2214"],
    "stile-right": ["#4a2c1c", "#382214", "#28180e"],
    "inner-left": ["#2e1a10", "#1e1008", "#100806"],
    "inner-right": ["#54301c", "#3e2416", "#28180e"],
    back: ["#5a3828", "#3c2418", "#1a100a"],
  };
  return table[id] ?? ["#6a4228", "#4e301e", "#362016"];
}

function hasShade(id: string) {
  return (
    id === "back" ||
    id.startsWith("under") ||
    id.startsWith("deck") ||
    id.startsWith("inner") ||
    id.startsWith("front")
  );
}

function shadeGradient(face: Face, minX: number, maxX: number, minY: number, maxY: number) {
  if (!hasShade(face.id)) return null;
  const id = `${PREFIX}-shade-${face.id}`;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  if (face.id.startsWith("under")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={midX} y1={minY} x2={midX} y2={maxY}>
        <stop offset="0%" stopColor="#120806" stopOpacity="0.05" />
        <stop offset="55%" stopColor="#120806" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#120806" stopOpacity="0.55" />
      </linearGradient>
    );
  }
  if (face.id.startsWith("deck")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={midX} y1={maxY} x2={midX} y2={minY}>
        <stop offset="0%" stopColor="#120806" stopOpacity="0" />
        <stop offset="70%" stopColor="#120806" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#120806" stopOpacity="0.32" />
      </linearGradient>
    );
  }
  if (face.id === "back") {
    return (
      <radialGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        cx={midX}
        cy={midY}
        r={Math.max(maxX - minX, maxY - minY) * 0.72}
      >
        <stop offset="0%" stopColor="#120806" stopOpacity="0" />
        <stop offset="55%" stopColor="#120806" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#120806" stopOpacity="0.45" />
      </radialGradient>
    );
  }
  if (face.id === "inner-left") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop offset="0%" stopColor="#120806" stopOpacity="0.05" />
        <stop offset="100%" stopColor="#120806" stopOpacity="0.42" />
      </linearGradient>
    );
  }
  if (face.id === "inner-right") {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={maxX} y1={midY} x2={minX} y2={midY}>
        <stop offset="0%" stopColor="#120806" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#120806" stopOpacity="0.36" />
      </linearGradient>
    );
  }
  if (face.id.startsWith("front")) {
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={minX} y1={midY} x2={maxX} y2={midY}>
        <stop offset="0%" stopColor="#120806" stopOpacity="0.12" />
        <stop offset="12%" stopColor="#120806" stopOpacity="0" />
        <stop offset="88%" stopColor="#120806" stopOpacity="0" />
        <stop offset="100%" stopColor="#120806" stopOpacity="0.18" />
      </linearGradient>
    );
  }
  return null;
}

function jointLines(face: Face) {
  const [a, b, c, d] = face.points;
  if (face.id.startsWith("under") || face.id.startsWith("deck")) {
    const top = face.id === "under-1";
    return [
      { a, b: d, opacity: top ? 0.55 : 0.35, width: 2.6 },
      { a: b, b: c, opacity: top ? 0.48 : 0.3, width: 2.4 },
      { a: d, b: c, opacity: 0.4, width: 2.2 },
    ];
  }
  if (face.id.startsWith("front")) {
    return [
      { a, b: d, opacity: 0.22, width: 1.8 },
      { a: b, b: c, opacity: 0.28, width: 1.8 },
    ];
  }
  if (face.id === "inner-left" || face.id === "inner-right") {
    return [{ a: b, b: c, opacity: 0.35, width: 2.2 }];
  }
  return [];
}
