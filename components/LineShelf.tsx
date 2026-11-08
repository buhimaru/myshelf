"use client";

/**
 * 参考画像（1024×682）の線画本棚。
 * 座標は画像の黒線を測った値。線の太さと位置はここだけで調整する。
 * 作品ジャケットは装飾の手前、枠と棚板の線の奥に置く。
 */

import { useState } from "react";
import type { MediaItem, MediaType } from "../types/media";
import { SHELF_TYPE_LABEL } from "../utils/shelfDisplay";
import { shelfItemAriaLabel } from "../utils/tmdb/credits";
import { spineAppearance } from "../utils/spineAppearance";
import styles from "./LineShelf.module.css";

export const LINE_SHELF = {
  width: 1024,
  height: 682,
  stroke: "#000000",
  strokeWidth: 1.5,
} as const;

const S = [140, 251, 340, 436, 528] as const;

/** 各棚板の上面。二重線の上側で、ジャケットの下端をここに合わせる。 */
const SHELF_TOPS = [140, 242, 340, 436, 528] as const;
/** 各段の天井。上の棚板の下側の線、または天板の下端。 */
const BAY_CEILINGS = [45, 158, 251, 350, 446] as const;
const INNER_LEFT = 96;
const INNER_RIGHT = 928;
const BAY_PAD = 4;
const MAX_COVER_HEIGHT = 144;

const COVER_SCALE =
  Math.min(
    ...SHELF_TOPS.map((top, index) => top - BAY_CEILINGS[index] - BAY_PAD)
  ) / MAX_COVER_HEIGHT;

type CoverKind = "book" | "manga" | "poster" | "cd" | "lp" | "game";

function hashId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(hash: number, salt: number) {
  const mixed = Math.imul(hash ^ salt, 2246822519) >>> 0;
  return (mixed % 1000) / 1000;
}

function pick(hash: number, salt: number, min: number, max: number) {
  return Math.round(min + unit(hash, salt) * (max - min));
}

function coverFace(id: string, type: MediaType) {
  const hash = hashId(id);
  const form = spineAppearance(id, type).form;

  if (form === "lp") {
    const width = pick(hash, 3, 104, 120);
    return { kind: "lp" as CoverKind, width, height: width };
  }
  if (form === "cd") {
    const width = pick(hash, 3, 86, 100);
    return { kind: "cd" as CoverKind, width, height: width };
  }
  if (form === "dvd" || form === "bluray") {
    return {
      kind: "poster" as CoverKind,
      width: pick(hash, 3, 72, 88),
      height: pick(hash, 5, 108, 136),
    };
  }
  if (form === "game") {
    return {
      kind: "game" as CoverKind,
      width: pick(hash, 3, 78, 96),
      height: pick(hash, 5, 104, 128),
    };
  }
  if (form === "manga") {
    return {
      kind: "manga" as CoverKind,
      width: pick(hash, 3, 68, 84),
      height: pick(hash, 5, 112, 144),
    };
  }
  return {
    kind: "book" as CoverKind,
    width: pick(hash, 3, 74, 92),
    height: pick(hash, 5, 112, 142),
  };
}

function scaledFace(id: string, type: MediaType) {
  const face = coverFace(id, type);
  return {
    kind: face.kind,
    width: Math.max(1, Math.round(face.width * COVER_SCALE)),
    height: Math.max(1, Math.round(face.height * COVER_SCALE)),
  };
}

type PlacedWork = {
  item: MediaItem;
  kind: CoverKind;
  x: number;
  y: number;
  width: number;
  height: number;
};

function placeWorks(items: MediaItem[]): PlacedWork[] {
  const perRow = Math.ceil(items.length / SHELF_TOPS.length);
  const placed: PlacedWork[] = [];

  SHELF_TOPS.forEach((shelfTop, rowIndex) => {
    const row = items.slice(rowIndex * perRow, (rowIndex + 1) * perRow);
    const faces = row.map((item) => scaledFace(item.id, item.type));
    const used = faces.reduce((sum, face) => sum + face.width, 0);
    const gap = (INNER_RIGHT - INNER_LEFT - used) / (row.length + 1);
    let x = INNER_LEFT + gap;

    row.forEach((item, index) => {
      const face = faces[index];
      placed.push({
        item,
        kind: face.kind,
        x,
        y: shelfTop - face.height,
        width: face.width,
        height: face.height,
      });
      x += face.width + gap;
    });
  });

  return placed;
}

type Book = { x: number; w: number; top: number; lean?: number };
type Layer = { x: number; w: number; h: number };

function UprightBooks({ books, bottom }: { books: Book[]; bottom: number }) {
  return (
    <g>
      {books.map((b, i) => {
        const lean = b.lean ?? 0;
        return (
          <path
            key={i}
            d={`M ${b.x} ${bottom} L ${b.x + lean} ${b.top} L ${b.x + b.w + lean} ${b.top} L ${b.x + b.w} ${bottom}`}
          />
        );
      })}
    </g>
  );
}

function Stack({ layers, shelf }: { layers: Layer[]; shelf: number }) {
  let y = shelf;
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < layers.length; i++) {
    y -= layers[i].h;
    rects.push({ x: layers[i].x, y, w: layers[i].w, h: layers[i].h });
  }
  return (
    <g>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />
      ))}
    </g>
  );
}

function Landscape({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const sunX = x + w * 0.68;
  const sunY = y + h * 0.36;
  const r = Math.min(w, h) * 0.13;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} />
      <circle cx={sunX} cy={sunY} r={r} />
      <path
        d={`M ${x + w * 0.1} ${y + h * 0.7} Q ${x + w * 0.42} ${y + h * 0.5} ${x + w * 0.9} ${y + h * 0.68}`}
      />
    </g>
  );
}

function LeafFrame({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  const top = y + h * 0.2;
  const bot = y + h * 0.84;
  const leaf = (cy: number, dir: number) => {
    const lx = cx + dir * w * 0.16;
    return `M ${cx} ${cy} Q ${lx} ${cy - h * 0.08} ${lx} ${cy - h * 0.16} Q ${cx + dir * w * 0.04} ${cy - h * 0.08} ${cx} ${cy}`;
  };
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} />
      <path d={`M ${cx} ${bot} L ${cx} ${top}`} />
      <path d={leaf(bot - h * 0.18, -1)} />
      <path d={leaf(bot - h * 0.18, 1)} />
      <path d={leaf(bot - h * 0.4, -1)} />
      <path d={leaf(bot - h * 0.4, 1)} />
      <path d={leaf(bot - h * 0.58, -1)} />
      <path d={leaf(bot - h * 0.58, 1)} />
    </g>
  );
}

function Plant({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const rim = y + h * 0.62;
  const cx = x + w * 0.5;
  const left = { x: x + w * 0.22, y: y + h * 0.28 };
  const right = { x: x + w * 0.78, y: y + h * 0.16 };
  return (
    <g>
      <path
        d={`M ${x + w * 0.14} ${rim} H ${x + w * 0.86} M ${x + w * 0.24} ${rim} L ${x + w * 0.32} ${y + h} H ${x + w * 0.68} L ${x + w * 0.76} ${rim}`}
      />
      <path d={`M ${cx} ${rim} L ${cx} ${y + h * 0.32}`} />
      <ellipse
        cx={left.x}
        cy={left.y}
        rx={w * 0.2}
        ry={h * 0.1}
        transform={`rotate(-50 ${left.x} ${left.y})`}
      />
      <ellipse
        cx={right.x}
        cy={right.y}
        rx={w * 0.22}
        ry={h * 0.1}
        transform={`rotate(40 ${right.x} ${right.y})`}
      />
    </g>
  );
}

function Bowl({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const rim = y + h * 0.22;
  const ry = Math.max(3, h * 0.16);
  const cx = x + w / 2;
  return (
    <g>
      <path
        d={`M ${x} ${rim} Q ${x + w * 0.04} ${y + h} ${cx} ${y + h} Q ${x + w * 0.96} ${y + h} ${x + w} ${rim}`}
      />
      <ellipse cx={cx} cy={rim} rx={w / 2} ry={ry} />
    </g>
  );
}

function Bottle({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  const neckL = cx - w * 0.1;
  const neckR = cx + w * 0.1;
  const neckBot = y + h * 0.28;
  return (
    <path
      d={`M ${neckL} ${y} H ${neckR} L ${neckR} ${neckBot}
        C ${x + w * 0.92} ${y + h * 0.42} ${x + w} ${y + h * 0.62} ${x + w * 0.86} ${y + h * 0.78}
        C ${x + w * 0.72} ${y + h} ${x + w * 0.28} ${y + h} ${x + w * 0.14} ${y + h * 0.78}
        C ${x} ${y + h * 0.62} ${x + w * 0.08} ${y + h * 0.42} ${neckL} ${neckBot} Z`}
    />
  );
}

function RoundVase({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  const mouth = w * 0.22;
  return (
    <path
      d={`M ${cx - mouth} ${y} H ${cx + mouth}
        C ${cx + mouth} ${y + h * 0.16} ${x + w} ${y + h * 0.28} ${x + w} ${y + h * 0.55}
        C ${x + w} ${y + h * 0.86} ${cx + w * 0.28} ${y + h} ${cx} ${y + h}
        C ${cx - w * 0.28} ${y + h} ${x} ${y + h * 0.86} ${x} ${y + h * 0.55}
        C ${x} ${y + h * 0.28} ${cx - mouth} ${y + h * 0.16} ${cx - mouth} ${y} Z`}
    />
  );
}

function Tin({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lid = h * 0.28;
  return (
    <g>
      <rect x={x} y={y + lid} width={w} height={h - lid} rx={3} />
      <rect x={x + w * 0.04} y={y} width={w * 0.92} height={lid} rx={3} />
    </g>
  );
}

function Cup({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const inset = w * 0.12;
  return (
    <path
      d={`M ${x} ${y} L ${x + inset} ${y + h} L ${x + w - inset} ${y + h} L ${x + w} ${y}`}
    />
  );
}

function Bird({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const bookTop = y + h * 0.62;
  const bodyY = y + h * 0.4;
  return (
    <g>
      <rect x={x + w * 0.06} y={bookTop} width={w * 0.88} height={h * 0.38} />
      <path d={`M ${x + w * 0.18} ${bookTop} L ${x + w * 0.18} ${bookTop + 8}`} />
      <path d={`M ${x + w * 0.34} ${bookTop} L ${x + w * 0.34} ${bookTop + 8}`} />
      <ellipse cx={x + w * 0.48} cy={bodyY} rx={w * 0.22} ry={h * 0.2} />
      <circle cx={x + w * 0.28} cy={y + h * 0.28} r={h * 0.12} />
      <path d={`M ${x + w * 0.16} ${y + h * 0.28} L ${x + w * 0.06} ${y + h * 0.24} L ${x + w * 0.16} ${y + h * 0.34}`} />
      <path d={`M ${x + w * 0.66} ${bodyY} L ${x + w * 0.9} ${y + h * 0.3} L ${x + w * 0.68} ${bodyY + h * 0.08}`} />
    </g>
  );
}

function Pear({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w * 0.48;
  return (
    <g>
      <path
        d={`M ${cx} ${y + h * 0.22}
          C ${x + w * 0.15} ${y + h * 0.2} ${x} ${y + h * 0.55} ${x + w * 0.12} ${y + h * 0.78}
          C ${x + w * 0.22} ${y + h} ${x + w * 0.78} ${y + h} ${x + w * 0.88} ${y + h * 0.72}
          C ${x + w} ${y + h * 0.48} ${x + w * 0.82} ${y + h * 0.18} ${cx} ${y + h * 0.22}`}
      />
      <path d={`M ${cx} ${y + h * 0.22} C ${cx + w * 0.08} ${y} ${cx + w * 0.2} ${y + h * 0.02} ${cx + w * 0.16} ${y + h * 0.16}`} />
    </g>
  );
}

function Furniture() {
  return (
    <g id="furniture">
      <path d="M 46 14 H 977 V 28 L 937 45 H 86 L 46 28 Z" />
      <path d="M 51 45 H 972" />

      <path d="M 51 30 V 660" />
      <path d="M 73 30 V 660" />
      <path d="M 950 30 V 660" />
      <path d="M 972 30 V 660" />
      <path d="M 86 45 V 140 M 86 162 V 240 M 86 270 V 339 M 86 359 V 436 M 86 461 V 528" />
      <path d="M 937 45 V 140 M 937 158 V 240 M 937 254 V 339 M 937 350 V 436 M 937 447 V 528" />

      <path d="M 51 140 H 972" />
      <path d="M 51 158 H 972" />
      <path d="M 51 242 H 972" />
      <path d="M 51 251 H 972" />
      <path d="M 51 340 H 972" />
      <path d="M 51 350 H 972" />
      <path d="M 51 436 H 972" />
      <path d="M 51 446 H 972" />
      <path d="M 51 528 H 972" />
      <path d="M 47 543 H 976" />

      <path d="M 81 550 H 358" />
      <path d="M 374 550 H 649" />
      <path d="M 665 550 H 942" />
      <path d="M 81 550 V 642" />
      <path d="M 218 550 V 642" />
      <path d="M 358 550 V 642" />
      <path d="M 374 550 V 642" />
      <path d="M 511 550 V 642" />
      <path d="M 649 550 V 642" />
      <path d="M 657 550 V 642" />
      <path d="M 665 550 V 642" />
      <path d="M 805 550 V 642" />
      <path d="M 942 550 V 642" />
      <path d="M 51 642 H 972" />

      <rect x="206" y="570" width="6" height="33" rx="3" />
      <rect x="226" y="569" width="5" height="35" rx="3" />
      <rect x="499" y="569" width="6" height="35" rx="3" />
      <rect x="519" y="569" width="5" height="35" rx="3" />
      <rect x="792" y="569" width="6" height="35" rx="3" />
      <rect x="812" y="569" width="5" height="35" rx="3" />

      <path d="M 46 642 V 660" />
      <path d="M 977 642 V 660" />
      <path d="M 46 660 H 977" />
    </g>
  );
}

function Ornaments() {
  return (
    <g id="ornaments">
      <Plant x={112} y={68} w={58} h={72} />
      <UprightBooks
        bottom={S[0]}
        books={[
          { x: 218, w: 14, top: 86 },
          { x: 232, w: 15, top: 78 },
          { x: 247, w: 15, top: 66 },
          { x: 262, w: 14, top: 92 },
          { x: 276, w: 16, top: 74, lean: 12 },
        ]}
      />
      <Stack
        shelf={S[0]}
        layers={[
          { x: 370, w: 92, h: 14 },
          { x: 384, w: 64, h: 14 },
        ]}
      />
      <Landscape x={503} y={65} w={111} h={75} />
      <Bowl x={648} y={118} w={48} h={22} />
      <UprightBooks
        bottom={S[0]}
        books={[
          { x: 759, w: 15, top: 86 },
          { x: 774, w: 14, top: 72 },
          { x: 788, w: 15, top: 80 },
          { x: 803, w: 14, top: 90, lean: 12 },
        ]}
      />
      <Stack
        shelf={S[0]}
        layers={[
          { x: 845, w: 80, h: 13 },
          { x: 858, w: 52, h: 13 },
        ]}
      />

      <Landscape x={108} y={176} w={90} h={75} />
      <UprightBooks
        bottom={S[1]}
        books={[
          { x: 222, w: 16, top: 186 },
          { x: 238, w: 16, top: 178 },
          { x: 254, w: 15, top: 184 },
          { x: 269, w: 16, top: 176 },
          { x: 285, w: 16, top: 188, lean: 18 },
        ]}
      />
      <Stack
        shelf={S[1]}
        layers={[
          { x: 372, w: 86, h: 16 },
          { x: 380, w: 70, h: 16 },
        ]}
      />
      <Bottle x={548} y={176} w={48} h={75} />
      <Stack
        shelf={S[1]}
        layers={[
          { x: 624, w: 92, h: 16 },
          { x: 640, w: 60, h: 14 },
        ]}
      />
      <Tin x={786} y={214} w={72} h={37} />
      <UprightBooks
        bottom={S[1]}
        books={[
          { x: 888, w: 14, top: 182 },
          { x: 902, w: 14, top: 174 },
          { x: 916, w: 12, top: 188, lean: 8 },
        ]}
      />

      <UprightBooks
        bottom={S[2]}
        books={[
          { x: 98, w: 14, top: 276 },
          { x: 112, w: 14, top: 268 },
          { x: 126, w: 14, top: 284 },
          { x: 140, w: 14, top: 272 },
        ]}
      />
      <Bowl x={214} y={308} w={52} h={32} />
      <Stack
        shelf={S[2]}
        layers={[
          { x: 348, w: 78, h: 16 },
          { x: 360, w: 54, h: 14 },
        ]}
      />
      <UprightBooks
        bottom={S[2]}
        books={[
          { x: 432, w: 15, top: 274 },
          { x: 447, w: 15, top: 268 },
          { x: 462, w: 14, top: 280 },
          { x: 476, w: 16, top: 272, lean: 16 },
        ]}
      />
      <Bird x={600} y={278} w={92} h={62} />
      <UprightBooks
        bottom={S[2]}
        books={[
          { x: 724, w: 16, top: 278 },
          { x: 740, w: 16, top: 272 },
        ]}
      />
      <Plant x={792} y={272} w={50} h={68} />
      <Stack
        shelf={S[2]}
        layers={[
          { x: 858, w: 68, h: 13 },
          { x: 870, w: 44, h: 12 },
        ]}
      />

      <Stack
        shelf={S[3]}
        layers={[
          { x: 108, w: 120, h: 22 },
          { x: 124, w: 88, h: 20 },
        ]}
      />
      <RoundVase x={252} y={368} w={52} h={68} />
      <UprightBooks
        bottom={S[3]}
        books={[
          { x: 322, w: 16, top: 368 },
          { x: 338, w: 16, top: 360 },
          { x: 354, w: 16, top: 374 },
          { x: 370, w: 16, top: 366, lean: 14 },
        ]}
      />
      <LeafFrame x={430} y={362} w={78} h={74} />
      <Stack
        shelf={S[3]}
        layers={[
          { x: 528, w: 100, h: 18 },
          { x: 544, w: 68, h: 16 },
        ]}
      />
      <Cup x={698} y={380} w={30} h={52} />
      <UprightBooks
        bottom={S[3]}
        books={[
          { x: 758, w: 15, top: 368 },
          { x: 773, w: 15, top: 360 },
          { x: 788, w: 15, top: 372 },
          { x: 803, w: 14, top: 366, lean: 14 },
        ]}
      />
      <Bowl x={860} y={408} w={62} h={28} />

      <UprightBooks
        bottom={S[4]}
        books={[
          { x: 100, w: 16, top: 468 },
          { x: 116, w: 16, top: 460 },
          { x: 132, w: 15, top: 476 },
          { x: 147, w: 15, top: 470, lean: 12 },
        ]}
      />
      <Stack
        shelf={S[4]}
        layers={[
          { x: 214, w: 84, h: 14 },
          { x: 228, w: 56, h: 12 },
        ]}
      />
      <Tin x={338} y={492} w={48} h={36} />
      <Stack
        shelf={S[4]}
        layers={[
          { x: 438, w: 124, h: 12 },
          { x: 452, w: 96, h: 12 },
          { x: 468, w: 64, h: 11 },
        ]}
      />
      <Pear x={608} y={492} w={36} h={36} />
      <UprightBooks
        bottom={S[4]}
        books={[
          { x: 674, w: 15, top: 468 },
          { x: 689, w: 15, top: 460 },
          { x: 704, w: 14, top: 474 },
          { x: 718, w: 14, top: 466, lean: 12 },
        ]}
      />
      <Bowl x={778} y={500} w={58} h={28} />
      <Stack
        shelf={S[4]}
        layers={[
          { x: 868, w: 56, h: 12 },
          { x: 878, w: 36, h: 10 },
        ]}
      />
    </g>
  );
}

const strokeProps = {
  fill: "none",
  stroke: LINE_SHELF.stroke,
  strokeWidth: LINE_SHELF.strokeWidth,
  strokeLinecap: "butt" as const,
  strokeLinejoin: "miter" as const,
};

type LineShelfProps = {
  items?: MediaItem[];
  onOpen?: (item: MediaItem) => void;
};

export default function LineShelf({ items = [], onOpen }: LineShelfProps) {
  const [failedCovers, setFailedCovers] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const works = placeWorks(items);

  const markCoverFailed = (key: string) => {
    setFailedCovers((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  return (
    <div className={styles.stage}>
      <svg
        className={styles.layer}
        viewBox={`0 0 ${LINE_SHELF.width} ${LINE_SHELF.height}`}
        aria-hidden="true"
      >
        <g {...strokeProps}>
          <Ornaments />
        </g>
      </svg>
      <div className={styles.works}>
        {works.map((work) => {
          const genre = SHELF_TYPE_LABEL[work.item.type] ?? "作品";
          const coverKey = `${work.item.id}\0${work.item.imageUrl ?? ""}`;
          const showImage =
            Boolean(work.item.imageUrl) && !failedCovers.has(coverKey);
          return (
            <button
              key={work.item.id}
              type="button"
              className={styles.work}
              style={{
                left: `${(work.x / LINE_SHELF.width) * 100}%`,
                top: `${(work.y / LINE_SHELF.height) * 100}%`,
                width: `${(work.width / LINE_SHELF.width) * 100}%`,
                height: `${(work.height / LINE_SHELF.height) * 100}%`,
              }}
              aria-label={shelfItemAriaLabel({
                title: work.item.title,
                creator: work.item.creator,
                type: work.item.type,
                genreLabel: genre,
              })}
              onClick={() => onOpen?.(work.item)}
            >
              <span className={`${styles.face} ${styles[work.kind]}`}>
                {!showImage && (
                  <span className={styles.fallback}>
                    <span className={styles.genre}>{genre}</span>
                    <span className={styles.title}>{work.item.title}</span>
                  </span>
                )}
                {showImage && (
                  <img
                    className={styles.image}
                    src={work.item.imageUrl}
                    alt=""
                    onError={() => markCoverFailed(coverKey)}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <svg
        className={`${styles.layer} ${styles.front}`}
        viewBox={`0 0 ${LINE_SHELF.width} ${LINE_SHELF.height}`}
        role="img"
        aria-label="線画の本棚"
      >
        <g {...strokeProps}>
          <Furniture />
        </g>
      </svg>
    </div>
  );
}
