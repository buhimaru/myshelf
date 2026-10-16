import type { MediaType } from "../types/media";

/**
 * 背表紙の見た目。作品IDから安定して決まり、再描画では変わらない。
 * 登録内容や実際の所有媒体を表すものではなく、棚の視覚表現だけに使う。
 */
export type SpineForm = "book" | "manga" | "dvd" | "bluray" | "cd" | "lp" | "game";

export type SpineMotif = 0 | 1 | 2;
export type SpineAlign = "start" | "center" | "end";

export type SpineAppearance = {
  form: SpineForm;
  writing: "vertical" | "horizontal";
  /** 装飾の種類。作品IDから安定して決まる */
  motif: SpineMotif;
  /** 縦書きの文字位置。作品IDから安定して決まる */
  align: SpineAlign;
  background: string;
  ink: string;
  width: number;
  height: number;
  /** タップ領域を含む列幅。見た目の背表紙より広いことがある */
  slotWidth: number;
};

type Swatch = { background: string; ink: string };

const BOOK: Swatch[] = [
  { background: "#6e3b2c", ink: "#f6efe6" },
  { background: "#243f38", ink: "#f3efe4" },
  { background: "#7d2e2e", ink: "#f8efe8" },
  { background: "#1e3348", ink: "#f4efe6" },
  { background: "#cbb89a", ink: "#3a2e24" },
  { background: "#4e3426", ink: "#f6efe6" },
  { background: "#8d6a3f", ink: "#fff8ee" },
  { background: "#2f2a28", ink: "#f3ece4" },
  { background: "#eadfce", ink: "#3f342b" },
  { background: "#5c2a3a", ink: "#f8efe8" },
];

const MANGA: Swatch[] = [
  { background: "#c23b3b", ink: "#fff6f2" },
  { background: "#1c1c1c", ink: "#f5f0e8" },
  { background: "#efe4d4", ink: "#2c241c" },
  { background: "#2f5d50", ink: "#f4f7f4" },
  { background: "#d4a24a", ink: "#2a2114" },
  { background: "#3d2b4a", ink: "#f7f1fb" },
  { background: "#b85c38", ink: "#fff6ef" },
  { background: "#1f3a5f", ink: "#f3f6fb" },
];

const DVD: Swatch[] = [
  { background: "#1c1c1c", ink: "#f3f3f3" },
  { background: "#2a241f", ink: "#f6efe6" },
  { background: "#3a2a22", ink: "#f8f1e8" },
  { background: "#242833", ink: "#f2f4f8" },
];

const BLURAY: Swatch[] = [
  { background: "#16324f", ink: "#f3f7fb" },
  { background: "#1a3a6b", ink: "#f4f8ff" },
  { background: "#0e4c6e", ink: "#f3fbff" },
  { background: "#243656", ink: "#f4f7fb" },
];

const CD: Swatch[] = [
  { background: "#1a1a1a", ink: "#f5f5f5" },
  { background: "#3d3030", ink: "#f8f1ee" },
  { background: "#1e3d36", ink: "#f3faf7" },
  { background: "#3d3428", ink: "#f8f3ea" },
  { background: "#2c3140", ink: "#f4f6fb" },
];

const LP: Swatch[] = [
  { background: "#c45c26", ink: "#fff8f2" },
  { background: "#1f4d3a", ink: "#f4faf6" },
  { background: "#6b2d3c", ink: "#fff5f7" },
  { background: "#e6d3b4", ink: "#3a2e22" },
  { background: "#2a3a5c", ink: "#f4f7fb" },
  { background: "#8a6a3b", ink: "#fff8ee" },
];

const GAME: Swatch[] = [
  { background: "#2d5fbf", ink: "#f4f8ff" },
  { background: "#1b1b1b", ink: "#f5f5f5" },
  { background: "#e8e4dc", ink: "#2c2824" },
  { background: "#8b1e3f", ink: "#fff5f8" },
  { background: "#3a6b4a", ink: "#f4faf6" },
  { background: "#4a3f8c", ink: "#f7f5ff" },
];

const MIN_TAP = 44;
const MIN_SLOT_WITH_ACTIONS = 84;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(hash: number, salt: number): number {
  const mixed = Math.imul(hash ^ salt, 2246822519) >>> 0;
  return (mixed % 1000) / 1000;
}

function pick(hash: number, salt: number, min: number, max: number): number {
  return Math.round(min + unit(hash, salt) * (max - min));
}

function swatch(list: Swatch[], hash: number, salt: number): Swatch {
  const index = Math.floor(unit(hash, salt) * list.length) % list.length;
  return list[index];
}

function formFor(type: MediaType, hash: number): SpineForm {
  if (type === "book") return "book";
  if (type === "manga") return "manga";
  if (type === "movie") return unit(hash, 3) < 0.5 ? "bluray" : "dvd";
  if (type === "music") return unit(hash, 5) < 0.42 ? "lp" : "cd";
  if (type === "game") return "game";
  return unit(hash, 7) < 0.5 ? "book" : "dvd";
}

export function spineAppearance(
  id: string,
  type: MediaType,
  withActions: boolean
): SpineAppearance {
  const hash = hashId(id);
  const form = formFor(type, hash);
  const color = swatch(
    form === "book"
      ? BOOK
      : form === "manga"
        ? MANGA
        : form === "dvd"
          ? DVD
          : form === "bluray"
            ? BLURAY
            : form === "cd"
              ? CD
              : form === "lp"
                ? LP
                : GAME,
    hash,
    11
  );

  const width =
    form === "lp"
      ? pick(hash, 13, 92, 118)
      : form === "cd"
        ? pick(hash, 13, 36, 46)
        : form === "dvd" || form === "bluray"
          ? pick(hash, 13, 34, 46)
          : form === "manga"
            ? pick(hash, 13, 32, 48)
            : pick(hash, 13, 34, 52);

  const height =
    form === "lp"
      ? pick(hash, 17, 136, 168)
      : form === "cd"
        ? pick(hash, 17, 150, 178)
        : form === "dvd" || form === "bluray"
          ? pick(hash, 17, 158, 198)
          : form === "game"
            ? pick(hash, 17, 164, 212)
            : pick(hash, 17, 168, 228);

  const minSlot = withActions ? MIN_SLOT_WITH_ACTIONS : MIN_TAP;
  const motif = Math.floor(unit(hash, 19) * 3) as SpineMotif;
  const align = (["start", "center", "end"] as const)[
    Math.floor(unit(hash, 23) * 3)
  ];

  return {
    form,
    writing: form === "lp" ? "horizontal" : "vertical",
    motif,
    align,
    background: color.background,
    ink: color.ink,
    width,
    height,
    slotWidth: Math.max(width, minSlot),
  };
}
