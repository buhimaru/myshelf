"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { COVER_SHELF_RICH_ITEMS } from "../app/dev/cover-shelf-preview/items";
import type { MediaItem, MediaType } from "../types/media";
import { spineAppearance } from "../utils/spineAppearance";
import {
  shelfGeometryFromBayClears,
  svgShelfBays,
  type ShelfGeometry,
} from "./SvgShelfFrame";
import SvgShelfNatural, { NATURAL_DEPTH } from "./SvgShelfNatural";
import styles from "./SvgShelfNaturalWorks.module.css";

/**
 * B（約5作品／段）を寸法の出発点にした作品配置実験。
 * 棚の幅・段間隔・段数は作品サイズから組み立てる（固定SVGへ押し込みない）。
 * 画面内に棚全体を収めるため、段数はおおよそ4段（約20作品）を上限にする。
 */
const DESIGN = {
  worksPerRow: 5,
  /** プレビューで棚全体のバランスを見やすくする段数上限 */
  maxBays: 4,
  viewWidth: 900,
  stile: 34,
  outerPad: 12,
  sideInset: 12,
  /** スロット内でジャケットが占める幅（縦横比は維持） */
  widthFill: 0.93,
  /** 段内の頭上余裕。大きい空白を避ける */
  headroom: 0.05,
  /** 下面の見え・接地 inset 用の余白（NATURAL_DEPTH 前提） */
  depthPad: 10,
  boardThickness: 12,
  topMargin: 20,
  bottomMargin: 16,
  gapMinRatio: 0.03,
  gapMaxRatio: 0.05,
} as const;

type CoverFace = { width: number; height: number };
type SizedWork = { width: number; height: number; ratio: number };

function hashId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}

function unit(hash: number, salt: number) {
  return ((hash >>> ((salt * 5) % 24)) & 255) / 255;
}

function pick(hash: number, salt: number, min: number, max: number) {
  return Math.round(min + unit(hash, salt) * (max - min));
}

/** 媒体ごとの縦横比だけ。絶対サイズはスロット幅から決める。 */
function coverAspect(id: string, type: MediaType): CoverFace {
  const hash = hashId(id);
  const form = spineAppearance(id, type).form;
  if (form === "lp") {
    const width = pick(hash, 3, 100, 116);
    return { width, height: width };
  }
  if (form === "cd") {
    const width = pick(hash, 3, 86, 100);
    return { width, height: width };
  }
  if (form === "dvd" || form === "bluray") {
    return { width: pick(hash, 3, 72, 88), height: pick(hash, 5, 108, 136) };
  }
  if (form === "game") {
    return { width: pick(hash, 3, 78, 96), height: pick(hash, 5, 104, 128) };
  }
  if (form === "manga") {
    return { width: pick(hash, 3, 68, 84), height: pick(hash, 5, 112, 144) };
  }
  return { width: pick(hash, 3, 74, 92), height: pick(hash, 5, 112, 142) };
}

function gapFor(id: string, slot: number) {
  const t = DESIGN.gapMinRatio + unit(hashId(id), 7) * (DESIGN.gapMaxRatio - DESIGN.gapMinRatio);
  return Math.round(slot * t);
}

function sizedWork(item: MediaItem, slotWidth: number): SizedWork {
  const aspect = coverAspect(item.id, item.type);
  const ratio = aspect.width / aspect.height;
  const widthFactor = DESIGN.widthFill * (0.96 + unit(hashId(item.id), 3) * 0.08);
  const width = slotWidth * widthFactor;
  const height = width / ratio;
  return { width, height, ratio };
}

function packRows(items: MediaItem[], bayWidth: number, slotWidth: number) {
  const rows: MediaItem[][] = [[]];
  let used = 0;
  for (const item of items) {
    const size = sizedWork(item, slotWidth);
    const row = rows[rows.length - 1];
    const gap = row.length === 0 ? gapFor(item.id, slotWidth) * 0.5 : gapFor(item.id, slotWidth);
    if (row.length > 0 && used + gap + size.width > bayWidth) {
      rows.push([item]);
      used = gapFor(item.id, slotWidth) * 0.5 + size.width;
      continue;
    }
    row.push(item);
    used += gap + size.width;
  }
  return rows;
}

/** その段の最も高い作品＋わずかな頭上。上端は揃えない。 */
function clearForRow(row: MediaItem[], slotWidth: number) {
  let tallest = 0;
  for (const item of row) {
    tallest = Math.max(tallest, sizedWork(item, slotWidth).height);
  }
  return Math.ceil(tallest * (1 + DESIGN.headroom) + DESIGN.depthPad);
}

type BuiltLayout = {
  geometry: ShelfGeometry;
  layout: ReturnType<typeof svgShelfBays>;
  rows: MediaItem[][];
  slotWidth: number;
  bayWidth: number;
  bayClears: number[];
};

function buildWorksShelf(items: MediaItem[]): BuiltLayout {
  const innerWidth =
    DESIGN.viewWidth - 2 * DESIGN.outerPad - 2 * DESIGN.stile;
  const bayWidth = innerWidth - 2 * DESIGN.sideInset;
  const slotWidth = bayWidth / DESIGN.worksPerRow;
  const capacity = DESIGN.worksPerRow * DESIGN.maxBays;
  const rows = packRows(items.slice(0, capacity), bayWidth, slotWidth).slice(
    0,
    DESIGN.maxBays,
  );
  let bayClears = rows.map((row) => clearForRow(row, slotWidth));

  // 遠近の下面・接地 inset で内寸が足りなければ、段ごとに底上げして再組立
  for (let pass = 0; pass < 3; pass += 1) {
    const geometry = shelfGeometryFromBayClears({
      bayClears,
      viewWidth: DESIGN.viewWidth,
      stile: DESIGN.stile,
      outerPad: DESIGN.outerPad,
      topMargin: DESIGN.topMargin,
      bottomMargin: DESIGN.bottomMargin,
      boardThickness: DESIGN.boardThickness,
    });
    const layout = svgShelfBays(NATURAL_DEPTH, geometry);
    let grew = false;
    bayClears = bayClears.map((clear, index) => {
      const row = rows[index] ?? [];
      const tallest = row.reduce(
        (max, item) => Math.max(max, sizedWork(item, slotWidth).height),
        0,
      );
      const available = layout.bays[index]?.maxHeight ?? clear;
      if (tallest <= available) return clear;
      grew = true;
      return clear + Math.ceil(tallest - available + 4);
    });
    if (!grew) {
      return { geometry, layout, rows, slotWidth, bayWidth, bayClears };
    }
  }

  const geometry = shelfGeometryFromBayClears({
    bayClears,
    viewWidth: DESIGN.viewWidth,
    stile: DESIGN.stile,
    outerPad: DESIGN.outerPad,
    topMargin: DESIGN.topMargin,
    bottomMargin: DESIGN.bottomMargin,
    boardThickness: DESIGN.boardThickness,
  });
  return {
    geometry,
    layout: svgShelfBays(NATURAL_DEPTH, geometry),
    rows,
    slotWidth,
    bayWidth,
    bayClears,
  };
}

export default function SvgShelfNaturalWorks() {
  const built = useMemo(() => buildWorksShelf(COVER_SHELF_RICH_ITEMS), []);
  const { geometry, layout, rows, slotWidth, bayClears } = built;

  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [measure, setMeasure] = useState<string>("");
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const items = [...stage.querySelectorAll<HTMLElement>("[data-work-item]")];
    const shelf = stage.querySelector("svg");
    if (items.length === 0 || !shelf) {
      setMeasure("");
      return;
    }
    const widths = items.map((el) => Math.round(el.getBoundingClientRect().width));
    const heights = items.map((el) => Math.round(el.getBoundingClientRect().height));
    const shelfBox = shelf.getBoundingClientRect();
    const mid = Math.floor(widths.length / 2);
    setMeasure(
      `実測 作品 ${widths[0]}×${heights[0]} 〜 ${widths[mid]}×${heights[mid]} 〜 ${widths[widths.length - 1]}×${heights[heights.length - 1]}px ／ 棚 ${Math.round(shelfBox.width)}×${Math.round(shelfBox.height)}px`,
    );
  }, [geometry.viewHeight, geometry.viewWidth]);

  const counts = rows.map((row) => row.length);
  const sample = sizedWork(COVER_SHELF_RICH_ITEMS[0], slotWidth);

  const worksBetween = (
    <>
      {layout.bays.map((bay, bayIndex) => {
        const row = rows[bayIndex] ?? [];
        const bayW = bay.innerRight - bay.innerLeft;
        const bayH = Math.max(1, bay.sitY - bay.ceilingY);
        return (
          <foreignObject
            key={bay.index}
            x={bay.innerLeft}
            y={bay.ceilingY}
            width={bayW}
            height={bayH}
          >
            <div
              // @ts-expect-error foreignObject 内の XHTML ルート
              xmlns="http://www.w3.org/1999/xhtml"
              data-bay=""
              className={styles.bay}
              style={{
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                paddingLeft: `${(DESIGN.sideInset / bayW) * 100}%`,
                paddingRight: `${(DESIGN.sideInset / bayW) * 100}%`,
              }}
            >
              {row.map((item, index) => {
                const size = sizedWork(item, slotWidth);
                const marginLeft =
                  index === 0
                    ? gapFor(item.id, slotWidth) * 0.45
                    : gapFor(item.id, slotWidth);
                const showImage = Boolean(item.imageUrl) && !failed.has(item.id);
                return (
                  <div
                    key={item.id}
                    data-work-item=""
                    className={styles.item}
                    style={{
                      width: `${(size.width / bayW) * 100}%`,
                      aspectRatio: `${size.width} / ${size.height}`,
                      marginLeft: `${(marginLeft / bayW) * 100}%`,
                      maxHeight: "100%",
                    }}
                    title={`${item.title} / ${item.creator}`}
                  >
                    {showImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className={styles.itemImg}
                        src={item.imageUrl}
                        alt=""
                        onError={() =>
                          setFailed((prev) => {
                            const next = new Set(prev);
                            next.add(item.id);
                            return next;
                          })
                        }
                      />
                    ) : (
                      <div className={styles.itemFallback}>{item.title}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </foreignObject>
        );
      })}
    </>
  );

  return (
    <div className={styles.frame}>
      <div
        className={styles.stage}
        ref={stageRef}
        style={
          {
            "--shelf-w": geometry.viewWidth,
            "--shelf-h": geometry.viewHeight,
          } as CSSProperties
        }
      >
        <SvgShelfNatural
          geometry={geometry}
          between={worksBetween}
          className={styles.shelfWrap}
        />
      </div>
      <p className={styles.stats}>
        B基準寸法：約{DESIGN.worksPerRow}作品/段 ／ 段数 {rows.length} ／ 段内寸{" "}
        {bayClears.join("・")} ／ viewBox {Math.round(geometry.viewWidth)}×
        {Math.round(geometry.viewHeight)} ／ 配置{" "}
        {counts.reduce((a, b) => a + b, 0)}作品（段ごと {counts.join("・")}）
        <br />
        設計例（1件目）: {Math.round(sample.width)}×{Math.round(sample.height)} viewBox単位
        {measure ? ` ／ ${measure}` : ""}
      </p>
    </div>
  );
}
