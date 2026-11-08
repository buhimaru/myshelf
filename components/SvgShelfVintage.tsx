import { svgShelfFaces } from "./SvgShelfFrame";
import styles from "./SvgShelfFrame.module.css";

/**
 * 保存版と同じ頂点。色は参考の飴色、木目は面ごとにずらす。
 * 光源は左上前方。明暗の差は小さく、接合と奥の角だけを少し暗くする。
 */
const PREFIX = "shelf-vintage";

type Face = ReturnType<typeof svgShelfFaces>[number];
type Point = Face["points"][number];

const SHIFT: Record<string, number> = {
  "front-1": 6,
  "front-2": 23,
  "front-3": 41,
  "front-4": 11,
  "front-5": 33,
  "under-1": 9,
  "under-2": 27,
  "deck-4": 14,
  "deck-5": 4,
  "stile-left": 0,
  "stile-right": 17,
  "inner-left": 8,
  "inner-right": 22,
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
  if (id === "back") return 0.55;
  if (id.startsWith("under")) return 0.46;
  if (id.startsWith("deck")) return 0.4;
  if (id.startsWith("inner")) return 0.34;
  return 0.48;
}

export default function SvgShelfVintage() {
  const faces = svgShelfFaces();

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.shelf}
        viewBox="0 0 1000 700"
        role="img"
        aria-label="飴色のヴィンテージ木製棚。保存版と同じ骨格に、落ち着いた木目と接合部の陰影を加えたもの。"
      >
        <defs>
          <g id={`${PREFIX}-src-h`}>
            <path d="M0 7 C90 4, 170 13, 310 8 S470 2, 620 10 S780 16, 920 7" stroke="#7a3e22" strokeWidth="0.8" fill="none" opacity="0.45" />
            <path d="M0 19 C70 24, 190 15, 340 21 S510 28, 690 18 S830 15, 920 22" stroke="#5e3018" strokeWidth="0.4" fill="none" opacity="0.32" />
            <path d="M20 34 C150 30, 260 40, 430 33 S640 28, 920 38" stroke="#f3d7b0" strokeWidth="0.45" fill="none" opacity="0.22" />
            <path d="M0 48 C110 53, 240 44, 390 51 S610 58, 800 46 S880 50, 920 54" stroke="#8a4a28" strokeWidth="0.6" fill="none" opacity="0.3" />
            <path d="M0 63 C140 60, 300 68, 520 62 S740 57, 920 66" stroke="#6a381c" strokeWidth="0.35" fill="none" opacity="0.22" />
          </g>
          <g id={`${PREFIX}-src-v`}>
            <path d="M6 0 C4 80, 9 160, 5 280 S3 420, 7 560 S5 640, 6 700" stroke="#7a3e22" strokeWidth="0.75" fill="none" opacity="0.42" />
            <path d="M16 0 C18 70, 13 190, 17 310 S20 450, 14 590 S16 660, 15 700" stroke="#5c3018" strokeWidth="0.4" fill="none" opacity="0.28" />
            <path d="M28 0 C26 120, 31 240, 27 390 S24 520, 29 700" stroke="#f3d7b0" strokeWidth="0.45" fill="none" opacity="0.2" />
            <path d="M37 0 C39 90, 34 210, 38 360 S41 500, 36 700" stroke="#8a4a28" strokeWidth="0.5" fill="none" opacity="0.26" />
          </g>
          <g id={`${PREFIX}-src-depth`}>
            <path d="M4 0 C3 40, 7 90, 4 150 S2 190, 5 240" stroke="#7a3e22" strokeWidth="0.55" fill="none" opacity="0.26" />
            <path d="M13 0 C15 36, 10 88, 14 140 S16 200, 12 240" stroke="#f0d2a6" strokeWidth="0.35" fill="none" opacity="0.14" />
            <path d="M22 0 C20 50, 25 110, 21 170 S19 210, 23 240" stroke="#5c3018" strokeWidth="0.4" fill="none" opacity="0.18" />
            <path d="M31 0 C33 28, 28 96, 32 160 S34 210, 30 240" stroke="#8a4a28" strokeWidth="0.3" fill="none" opacity="0.14" />
          </g>
          <g id={`${PREFIX}-src-back`}>
            <path d="M70 30 C180 70, 240 180, 190 320 S150 500, 210 620" stroke="#8a4e2c" strokeWidth="1.1" fill="none" opacity="0.4" />
            <path d="M210 16 C340 80, 400 200, 330 360 S280 540, 360 640" stroke="#7a4424" strokeWidth="0.7" fill="none" opacity="0.32" />
            <path d="M390 24 C500 90, 560 210, 470 380 S420 560, 520 650" stroke="#f2d4aa" strokeWidth="0.55" fill="none" opacity="0.2" />
            <path d="M40 180 C160 160, 300 210, 460 176 S700 150, 860 190" stroke="#6a381c" strokeWidth="0.45" fill="none" opacity="0.22" />
            <path d="M30 420 C180 400, 340 450, 520 414 S740 390, 870 430" stroke="#8a4e2c" strokeWidth="0.4" fill="none" opacity="0.18" />
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
                width={kind === "h" ? 920 : kind === "v" ? 48 : kind === "depth" ? 40 : 900}
                height={kind === "h" ? 72 : kind === "v" ? 700 : kind === "depth" ? 240 : 660}
              >
                <use href={`#${PREFIX}-src-${kind}`} />
              </pattern>
            );
          })}

          {faces.map((face) => (
            <FaceFill key={`${face.id}-fill`} face={face} />
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
              <polygon points={points} fill={`url(#${PREFIX}-fill-${face.id})`} stroke="none" />
              <polygon points={points} fill={`url(#${PREFIX}-grain-${face.id})`} opacity={grainOpacity(face.id)} stroke="none" />
              {shadeStops(face) && (
                <polygon points={points} fill={`url(#${PREFIX}-shade-${face.id})`} stroke="none" />
              )}
              {jointLines(face).map((joint, index) => (
                <line
                  key={index}
                  x1={joint.a.x}
                  y1={joint.a.y}
                  x2={joint.b.x}
                  y2={joint.b.y}
                  stroke="#6a3a22"
                  strokeWidth="2"
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

function FaceFill({ face }: { face: Face }) {
  const id = `${PREFIX}-fill-${face.id}`;
  const xs = face.points.map((point) => point.x);
  const ys = face.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const deck = face.id.startsWith("deck");
  const vertical = deck || face.id === "back" || face.id.startsWith("front") || face.id.startsWith("under");
  const [from, to] = fillStops(face.id);

  return (
    <>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={vertical ? midX : face.id === "inner-right" ? maxX : minX}
        y1={deck ? maxY : vertical ? minY : midY}
        x2={vertical ? midX : face.id === "inner-right" ? minX : maxX}
        y2={deck ? minY : vertical ? maxY : midY}
      >
        <stop offset="0%" stopColor={from} />
        <stop offset="100%" stopColor={to} />
      </linearGradient>
      {shadeStops(face) && (
        <linearGradient
          id={`${PREFIX}-shade-${face.id}`}
          gradientUnits="userSpaceOnUse"
          x1={shadeStops(face)!.x1(minX, maxX)}
          y1={shadeStops(face)!.y1(minY, maxY)}
          x2={shadeStops(face)!.x2(minX, maxX)}
          y2={shadeStops(face)!.y2(minY, maxY)}
        >
          {shadeStops(face)!.stops.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor="#5c3418" stopOpacity={stop.opacity} />
          ))}
        </linearGradient>
      )}
    </>
  );
}

function fillStops(id: string): [string, string] {
  const table: Record<string, [string, string]> = {
    "front-1": ["#e4a864", "#d08848"],
    "front-2": ["#d48a4c", "#c47840"],
    "front-3": ["#cc8448", "#be743c"],
    "front-4": ["#c88044", "#b66e38"],
    "front-5": ["#c07840", "#a86434"],
    "under-1": ["#b86a38", "#a05c30"],
    "under-2": ["#c27842", "#ae6836"],
    "deck-4": ["#f0c48a", "#e0a864"],
    "deck-5": ["#f3c890", "#e4ae6c"],
    "stile-left": ["#e8b06e", "#d49854"],
    "stile-right": ["#c88044", "#b46e38"],
    "inner-left": ["#b46c38", "#8f542c"],
    "inner-right": ["#e2b074", "#c88848"],
    back: ["#e4b06a", "#c48444"],
  };
  return table[id] ?? ["#d09054", "#c48448"];
}

function shadeStops(face: Face) {
  if (face.id.startsWith("under")) {
    return {
      x1: (minX: number, maxX: number) => (minX + maxX) / 2,
      y1: (_minY: number, maxY: number) => maxY - (maxY - _minY) * 0.72,
      x2: (minX: number, maxX: number) => (minX + maxX) / 2,
      y2: (_minY: number, maxY: number) => maxY,
      stops: [
        { offset: "0%", opacity: 0 },
        { offset: "100%", opacity: 0.22 },
      ],
    };
  }
  if (face.id.startsWith("deck")) {
    return {
      x1: (minX: number, maxX: number) => (minX + maxX) / 2,
      y1: (minY: number, maxY: number) => minY + (maxY - minY) * 0.7,
      x2: (minX: number, maxX: number) => (minX + maxX) / 2,
      y2: (minY: number) => minY,
      stops: [
        { offset: "0%", opacity: 0 },
        { offset: "100%", opacity: 0.16 },
      ],
    };
  }
  if (face.id === "back") {
    return {
      x1: (minX: number) => minX,
      y1: (minY: number, maxY: number) => (minY + maxY) / 2,
      x2: (_minX: number, maxX: number) => maxX,
      y2: (minY: number, maxY: number) => (minY + maxY) / 2,
      stops: [
        { offset: "0%", opacity: 0.2 },
        { offset: "14%", opacity: 0 },
        { offset: "86%", opacity: 0 },
        { offset: "100%", opacity: 0.14 },
      ],
    };
  }
  if (face.id === "inner-left" || face.id === "inner-right") {
    const toBack = face.id === "inner-left";
    return {
      x1: (minX: number, maxX: number) => (toBack ? maxX - (maxX - minX) * 0.35 : minX + (maxX - minX) * 0.35),
      y1: (minY: number, maxY: number) => (minY + maxY) / 2,
      x2: (minX: number, maxX: number) => (toBack ? maxX : minX),
      y2: (minY: number, maxY: number) => (minY + maxY) / 2,
      stops: [
        { offset: "0%", opacity: 0 },
        { offset: "100%", opacity: 0.2 },
      ],
    };
  }
  return null;
}

function jointLines(face: Face) {
  const [a, b, c, d] = face.points;
  if (face.id.startsWith("under") || face.id.startsWith("deck")) {
    const top = face.id === "under-1";
    return [
      { a, b: d, opacity: top ? 0.4 : 0.26 },
      { a: b, b: c, opacity: top ? 0.34 : 0.22 },
      { a: d, b: c, opacity: 0.28 },
    ];
  }
  if (face.id.startsWith("front")) {
    return [
      { a, b: d, opacity: 0.14 },
      { a: b, b: c, opacity: 0.2 },
    ];
  }
  if (face.id === "inner-left" || face.id === "inner-right") {
    return [{ a: b, b: c, opacity: 0.24 }];
  }
  return [];
}
