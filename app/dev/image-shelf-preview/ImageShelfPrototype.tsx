"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import ShelfItemDetail from "../../../components/ShelfItemDetail";
import type { MediaItem } from "../../../types/media";
import { SHELF_TYPE_LABEL } from "../../../utils/shelfDisplay";
import { COVER_SHELF_RICH_ITEMS } from "../cover-shelf-preview/items";
import styles from "./ImageShelfPrototype.module.css";
import CoverFitCompare from "./CoverFitCompare";
import DenseShelfCompare from "./DenseShelfCompare";
import IntrinsicPackCompare from "./IntrinsicPackCompare";
import LedAnchorCompare from "./LedAnchorCompare";
import LedRightCompare from "./LedRightCompare";
import AlignedSixCompare from "./AlignedSixCompare";
import MarginBalanceCompare from "./MarginBalanceCompare";
import EightRowCompare from "./EightRowCompare";
import WidthStretchCompare from "./WidthStretchCompare";
import OnePieceWidthCompare from "./OnePieceWidthCompare";
import {
  BAY_LAYOUTS,
  SHELF_BG,
  SHELF_BG_VARIANTS,
  type PlacedCover,
  type ShelfBgVariantId,
  isNearShelfLed,
  layoutDummyCovers,
  summarizeBayLayouts,
  toPercent,
} from "./shelfLayout";

const DUMMY_COUNT = 20;

/** 作品仕上げ: flat=暫定完成の現行CSS / natural=輪郭・光・影の試作 */
type CoverFinish = "flat" | "natural";

/** 分離試作アセット（本番未適用。complete は未変更） */
const LAYERED_SPINES = {
  /** 隣接木目からの推定空棚（旧試作） */
  bgEstimate: "/images/prototypes/shelf-bg-nospines-estimate.png?v=layered-1",
  /** ユーザー提供の新空棚候補（1024×664・幾何ほぼ一致） */
  bgNewEmpty: "/images/prototypes/shelf-empty-candidate-1024x664.png?v=newempty-1",
  overlay: "/images/prototypes/navy-leather-spines-overlay.png?v=layered-1",
  /** 新素材5冊を切り抜いて配置したオーバーレイ */
  overlayNewBooks:
    "/images/prototypes/navy-leather-5books-placed-1024x664.png?v=newbooks-1",
} as const;

type ViewMode =
  | { kind: "single"; variant: ShelfBgVariantId; finish: CoverFinish }
  | { kind: "compareNatural" }
  | { kind: "compareNavyBr" }
  | { kind: "compareBook5SideV2" }
  | { kind: "compareBook5SideV3" }
  | { kind: "layeredSpines" }
  | { kind: "compareLayeredSpines" }
  | { kind: "newEmptyLayered" }
  | { kind: "compareNewEmptyLayered" }
  | { kind: "newBooksLayered" }
  | { kind: "compareNewBooksLayered" }
  | { kind: "coverFit" }
  | { kind: "denseShelf" }
  | { kind: "intrinsicPack" }
  | { kind: "ledAnchor" }
  | { kind: "ledRight" }
  | { kind: "alignedSix" }
  | { kind: "marginBalance" }
  | { kind: "eightRow" }
  | { kind: "widthStretch" }
  | { kind: "onePieceWidth" };

function ShelfStage({
  bgSrc,
  placed,
  byId,
  onSelect,
  label,
  finish,
  decorOverlaySrc,
}: {
  bgSrc: string;
  placed: PlacedCover[];
  byId: Map<string, MediaItem>;
  onSelect: (item: MediaItem) => void;
  label?: string;
  finish: CoverFinish;
  /** 固定装飾（透明PNG）。指定時のみ背景の上に重ねる */
  decorOverlaySrc?: string;
}) {
  return (
    <div className={styles.stageWrap}>
      {label ? <p className={styles.stageLabel}>{label}</p> : null}
      <div
        className={`${styles.stage} ${finish === "natural" ? styles.stageNatural : ""}`}
        style={{ aspectRatio: `${SHELF_BG.width} / ${SHELF_BG.height}` }}
        data-finish={finish}
      >
        <Image
          src={bgSrc}
          alt="木製棚の背景"
          width={SHELF_BG.width}
          height={SHELF_BG.height}
          className={styles.bg}
          priority
          unoptimized
        />

        {decorOverlaySrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={decorOverlaySrc}
            alt=""
            className={styles.decorOverlay}
            width={SHELF_BG.width}
            height={SHELF_BG.height}
            draggable={false}
          />
        ) : null}

        <div className={styles.coverLayer} aria-label="作品表紙レイヤー">
          {placed.map((p) => {
            const item = byId.get(p.itemId);
            if (!item?.imageUrl) return null;
            const pct = toPercent(p);
            const nearLed = isNearShelfLed(p);
            return (
              <button
                key={`${bgSrc}-${finish}-${p.itemId}`}
                type="button"
                className={`${styles.coverBtn}${nearLed ? ` ${styles.coverNearLed}` : ""}`}
                style={{
                  left: pct.left,
                  top: pct.top,
                  width: pct.width,
                  height: pct.height,
                }}
                onClick={() => onSelect(item)}
                aria-label={`${item.title}の詳細を開く`}
                data-bay={p.bay}
                data-slot={p.slot}
              >
                {finish === "natural" ? (
                  <span className={styles.coverShadow} aria-hidden />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt=""
                  className={styles.coverImg}
                  draggable={false}
                />
                {finish === "natural" ? (
                  <span className={styles.coverLight} aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function viewLabel(mode: ViewMode): string {
  if (mode.kind === "compareNatural") {
    return "暫定完成版 / 自然な輪郭・陰影の試作";
  }
  if (mode.kind === "compareNavyBr") {
    return "ネイビー修正前 / 修正後比較";
  }
  if (mode.kind === "compareBook5SideV2") {
    return "採用版 / 5冊目側面再構築 v2（プレビュー）";
  }
  if (mode.kind === "compareBook5SideV3") {
    return "採用版 / v2 / v3 比較（プレビュー）";
  }
  if (mode.kind === "layeredSpines") {
    return "分離試作（推定空棚＋透明5冊）";
  }
  if (mode.kind === "compareLayeredSpines") {
    return "採用版 / 分離試作 比較";
  }
  if (mode.kind === "newEmptyLayered") {
    return "新空棚＋透明5冊";
  }
  if (mode.kind === "compareNewEmptyLayered") {
    return "採用版 / 新空棚＋透明5冊 比較";
  }
  if (mode.kind === "newBooksLayered") {
    return "新素材5冊＋新空棚";
  }
  if (mode.kind === "compareNewBooksLayered") {
    return "採用版 / 新素材5冊＋新空棚 比較";
  }
  if (mode.kind === "coverFit") {
    return "表紙フィット比較 A〜E（プレビュー専用）";
  }
  if (mode.kind === "denseShelf") {
    return "密配置比較 5/8/9列（プレビュー専用）";
  }
  if (mode.kind === "intrinsicPack") {
    return "均等配置（高さ維持・プレビュー専用）";
  }
  if (mode.kind === "ledAnchor") {
    return "LED直下アンカー比較（プレビュー専用）";
  }
  if (mode.kind === "ledRight") {
    return "LED右端固定 7-6-6-6（プレビュー専用）";
  }
  if (mode.kind === "alignedSix") {
    return "1・2段目そろえ 6-6-6-6（プレビュー専用）";
  }
  if (mode.kind === "marginBalance") {
    return "左右余白バランス比較（プレビュー専用）";
  }
  if (mode.kind === "eightRow") {
    return "1・2段目8作品（高さ維持・プレビュー専用）";
  }
  if (mode.kind === "widthStretch") {
    return "横方向 100/105/110/115%（プレビュー専用）";
  }
  if (mode.kind === "onePieceWidth") {
    return "ONE PIECEのみ 85/88px・130/135/140%（プレビュー専用）";
  }
  const base = SHELF_BG_VARIANTS[mode.variant].label;
  if (mode.finish === "natural") {
    return "ダークネイビー革（自然な輪郭・陰影の試作版）";
  }
  return base;
}

export default function ImageShelfPrototype() {
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [view, setView] = useState<ViewMode>({
    kind: "single",
    variant: "navy",
    finish: "flat",
  });

  const items = useMemo(
    () =>
      COVER_SHELF_RICH_ITEMS.filter((item) => Boolean(item.imageUrl)).slice(
        0,
        DUMMY_COUNT,
      ),
    [],
  );

  const byId = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const placed = useMemo(
    () => layoutDummyCovers(items.map((i) => i.id)),
    [items],
  );

  const counts = BAY_LAYOUTS.map((b) => b.xs.length);
  const summaries = useMemo(() => summarizeBayLayouts(), []);
  const navySrc = SHELF_BG_VARIANTS.navy.src;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar} role="toolbar" aria-label="背表紙・仕上げバリエーション">
        <div className={styles.btnGroup}>
          <button
            type="button"
            className={
              view.kind === "single" &&
              view.variant === "navyNewbooks" &&
              view.finish === "natural"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={
              view.kind === "single" &&
              view.variant === "navyNewbooks" &&
              view.finish === "natural"
            }
            onClick={() =>
              setView({
                kind: "single",
                variant: "navyNewbooks",
                finish: "natural",
              })
            }
          >
            正式採用（新素材5冊・焼き付け）
          </button>
          <button
            type="button"
            className={
              view.kind === "single" &&
              view.variant === "navy" &&
              view.finish === "flat"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={
              view.kind === "single" &&
              view.variant === "navy" &&
              view.finish === "flat"
            }
            onClick={() =>
              setView({ kind: "single", variant: "navy", finish: "flat" })
            }
          >
            ダークネイビー革（旧採用・complete）
          </button>
          <button
            type="button"
            className={
              view.kind === "single" &&
              view.variant === "navy" &&
              view.finish === "natural"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={
              view.kind === "single" &&
              view.variant === "navy" &&
              view.finish === "natural"
            }
            onClick={() =>
              setView({ kind: "single", variant: "navy", finish: "natural" })
            }
          >
            ダークネイビー革（自然な輪郭・陰影の試作版）
          </button>
          <button
            type="button"
            className={
              view.kind === "compareNatural"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "compareNatural"}
            onClick={() => setView({ kind: "compareNatural" })}
          >
            比較表示（完成 / 自然試作）
          </button>
        </div>
        <div className={styles.btnGroupSecondary}>
          <button
            type="button"
            className={
              view.kind === "single" && view.variant === "white"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "single" && view.variant === "white"}
            onClick={() =>
              setView({ kind: "single", variant: "white", finish: "flat" })
            }
          >
            白い背表紙
          </button>
          <button
            type="button"
            className={
              view.kind === "single" && view.variant === "navyBefore"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={
              view.kind === "single" && view.variant === "navyBefore"
            }
            onClick={() =>
              setView({ kind: "single", variant: "navyBefore", finish: "flat" })
            }
          >
            ネイビー修正前
          </button>
          <button
            type="button"
            className={
              view.kind === "compareNavyBr"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "compareNavyBr"}
            onClick={() => setView({ kind: "compareNavyBr" })}
          >
            ネイビー修正前後比較
          </button>
          <button
            type="button"
            className={
              view.kind === "single" && view.variant === "navyBook5SideV2"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={
              view.kind === "single" && view.variant === "navyBook5SideV2"
            }
            onClick={() =>
              setView({
                kind: "single",
                variant: "navyBook5SideV2",
                finish: "natural",
              })
            }
          >
            5冊目側面 v2（未採用）
          </button>
          <button
            type="button"
            className={
              view.kind === "compareBook5SideV2"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "compareBook5SideV2"}
            onClick={() => setView({ kind: "compareBook5SideV2" })}
          >
            採用版 / 側面v2 比較
          </button>
          <button
            type="button"
            className={
              view.kind === "single" && view.variant === "navyBook5SideV3"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={
              view.kind === "single" && view.variant === "navyBook5SideV3"
            }
            onClick={() =>
              setView({
                kind: "single",
                variant: "navyBook5SideV3",
                finish: "natural",
              })
            }
          >
            側面・棚奥 v3（未採用）
          </button>
          <button
            type="button"
            className={
              view.kind === "compareBook5SideV3"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "compareBook5SideV3"}
            onClick={() => setView({ kind: "compareBook5SideV3" })}
          >
            採用版 / v2 / v3 比較
          </button>
          <button
            type="button"
            className={
              view.kind === "layeredSpines"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "layeredSpines"}
            onClick={() => setView({ kind: "layeredSpines" })}
          >
            分離試作（空棚推定＋透明5冊）
          </button>
          <button
            type="button"
            className={
              view.kind === "compareLayeredSpines"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "compareLayeredSpines"}
            onClick={() => setView({ kind: "compareLayeredSpines" })}
          >
            採用版 / 分離試作 比較
          </button>
          <button
            type="button"
            className={
              view.kind === "newEmptyLayered"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "newEmptyLayered"}
            onClick={() => setView({ kind: "newEmptyLayered" })}
          >
            新空棚＋透明5冊
          </button>
          <button
            type="button"
            className={
              view.kind === "compareNewEmptyLayered"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "compareNewEmptyLayered"}
            onClick={() => setView({ kind: "compareNewEmptyLayered" })}
          >
            採用版 / 新空棚＋透明5冊 比較
          </button>
          <button
            type="button"
            className={
              view.kind === "newBooksLayered"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "newBooksLayered"}
            onClick={() => setView({ kind: "newBooksLayered" })}
          >
            新素材5冊＋新空棚
          </button>
          <button
            type="button"
            className={
              view.kind === "compareNewBooksLayered"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "compareNewBooksLayered"}
            onClick={() => setView({ kind: "compareNewBooksLayered" })}
          >
            採用版 / 新素材5冊＋新空棚 比較
          </button>
          <button
            type="button"
            className={
              view.kind === "coverFit" ? styles.toolBtnActive : styles.toolBtn
            }
            aria-pressed={view.kind === "coverFit"}
            onClick={() => setView({ kind: "coverFit" })}
          >
            表紙フィット比較 A〜E
          </button>
          <button
            type="button"
            className={
              view.kind === "denseShelf" ? styles.toolBtnActive : styles.toolBtn
            }
            aria-pressed={view.kind === "denseShelf"}
            onClick={() => setView({ kind: "denseShelf" })}
          >
            密配置比較 5/8/9列
          </button>
          <button
            type="button"
            className={
              view.kind === "intrinsicPack"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "intrinsicPack"}
            onClick={() => setView({ kind: "intrinsicPack" })}
          >
            均等配置（高さ維持）
          </button>
          <button
            type="button"
            className={
              view.kind === "ledAnchor" ? styles.toolBtnActive : styles.toolBtn
            }
            aria-pressed={view.kind === "ledAnchor"}
            onClick={() => setView({ kind: "ledAnchor" })}
          >
            LED直下アンカー比較
          </button>
          <button
            type="button"
            className={
              view.kind === "ledRight" ? styles.toolBtnActive : styles.toolBtn
            }
            aria-pressed={view.kind === "ledRight"}
            onClick={() => setView({ kind: "ledRight" })}
          >
            LED右端固定 7-6-6-6
          </button>
          <button
            type="button"
            className={
              view.kind === "alignedSix" ? styles.toolBtnActive : styles.toolBtn
            }
            aria-pressed={view.kind === "alignedSix"}
            onClick={() => setView({ kind: "alignedSix" })}
          >
            1・2段そろえ 6-6-6-6
          </button>
          <button
            type="button"
            className={
              view.kind === "marginBalance" ? styles.toolBtnActive : styles.toolBtn
            }
            aria-pressed={view.kind === "marginBalance"}
            onClick={() => setView({ kind: "marginBalance" })}
          >
            左右余白バランス
          </button>
          <button
            type="button"
            className={
              view.kind === "eightRow" ? styles.toolBtnActive : styles.toolBtn
            }
            aria-pressed={view.kind === "eightRow"}
            onClick={() => setView({ kind: "eightRow" })}
          >
            1・2段目8作品（高さ維持）
          </button>
          <button
            type="button"
            className={
              view.kind === "widthStretch"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "widthStretch"}
            onClick={() => setView({ kind: "widthStretch" })}
          >
            横方向 100/105/110/115%
          </button>
          <button
            type="button"
            className={
              view.kind === "onePieceWidth"
                ? styles.toolBtnActive
                : styles.toolBtn
            }
            aria-pressed={view.kind === "onePieceWidth"}
            onClick={() => setView({ kind: "onePieceWidth" })}
          >
            ONE PIECEのみ 85/88px・130/135/140%
          </button>
        </div>
      </div>

      {view.kind === "coverFit" ? (
        <CoverFitCompare onOpen={setSelected} />
      ) : view.kind === "denseShelf" ? (
        <DenseShelfCompare onOpen={setSelected} />
      ) : view.kind === "intrinsicPack" ? (
        <IntrinsicPackCompare onOpen={setSelected} />
      ) : view.kind === "ledAnchor" ? (
        <LedAnchorCompare onOpen={setSelected} />
      ) : view.kind === "ledRight" ? (
        <LedRightCompare onOpen={setSelected} />
      ) : view.kind === "alignedSix" ? (
        <AlignedSixCompare onOpen={setSelected} />
      ) : view.kind === "marginBalance" ? (
        <MarginBalanceCompare onOpen={setSelected} />
      ) : view.kind === "eightRow" ? (
        <EightRowCompare onOpen={setSelected} />
      ) : view.kind === "widthStretch" ? (
        <WidthStretchCompare onOpen={setSelected} />
      ) : view.kind === "onePieceWidth" ? (
        <OnePieceWidthCompare onOpen={setSelected} />
      ) : view.kind === "compareNatural" ? (
        <div className={styles.compareGrid}>
          <ShelfStage
            bgSrc={navySrc}
            placed={placed}
            byId={byId}
            onSelect={setSelected}
            label="ダークネイビー革（暫定完成版）"
            finish="flat"
          />
          <ShelfStage
            bgSrc={navySrc}
            placed={placed}
            byId={byId}
            onSelect={setSelected}
            label="ダークネイビー革（自然な輪郭・陰影の試作版）"
            finish="natural"
          />
        </div>
      ) : view.kind === "compareNavyBr" ? (
        <div className={styles.compareGrid}>
          <ShelfStage
            bgSrc={SHELF_BG_VARIANTS.navyBefore.src}
            placed={placed}
            byId={byId}
            onSelect={setSelected}
            label={SHELF_BG_VARIANTS.navyBefore.label}
            finish="flat"
          />
          <ShelfStage
            bgSrc={navySrc}
            placed={placed}
            byId={byId}
            onSelect={setSelected}
            label={SHELF_BG_VARIANTS.navy.label}
            finish="flat"
          />
        </div>
      ) : view.kind === "compareBook5SideV2" ? (
        <>
          <div className={styles.compareGrid}>
            <ShelfStage
              bgSrc={navySrc}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="採用版（complete）"
              finish="natural"
            />
            <ShelfStage
              bgSrc={SHELF_BG_VARIANTS.navyBook5SideV2.src}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label={SHELF_BG_VARIANTS.navyBook5SideV2.label}
              finish="natural"
            />
          </div>
          <section className={styles.zoomCompare} aria-label="5冊目右側面の拡大比較">
            <h2 className={styles.zoomTitle}>5冊目右側面の拡大比較</h2>
            <p className={styles.zoomLead}>
              上が棚全体クロップ、下が右端の近接拡大です。本番棚には未適用です。
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/book5side-v2-compare-shelf.png"
              alt="採用版と側面v2の棚全体比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/book5side-v2-compare-edge.png"
              alt="5冊目右端の拡大比較（修正前 / 修正後）"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/book5side-v2-compare-foot.png"
              alt="5冊目足元の拡大比較（修正前 / 修正後）"
            />
          </section>
        </>
      ) : view.kind === "compareBook5SideV3" ? (
        <>
          <div className={styles.compareGrid3}>
            <ShelfStage
              bgSrc={navySrc}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="① 採用版（complete）"
              finish="natural"
            />
            <ShelfStage
              bgSrc={SHELF_BG_VARIANTS.navyBook5SideV2.src}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="② v2（側面のみ）"
              finish="natural"
            />
            <ShelfStage
              bgSrc={SHELF_BG_VARIANTS.navyBook5SideV3.src}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="③ v3（側面＋棚奥接合）"
              finish="natural"
            />
          </div>
          <section
            className={styles.zoomCompare}
            aria-label="採用版・v2・v3 の拡大比較"
          >
            <h2 className={styles.zoomTitle}>
              5冊目右側〜棚奥の拡大比較（採用版 / v2 / v3）
            </h2>
            <p className={styles.zoomLead}>
              本番の画像棚には未適用です。承認まで complete
              を上書きしません。
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/book5side-v3-compare-shelf.png"
              alt="棚全体クロップの3者比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/book5side-v3-compare-cavity.png"
              alt="右端から棚奥の拡大3者比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/book5side-v3-compare-foot.png"
              alt="足元の拡大3者比較"
            />
          </section>
        </>
      ) : view.kind === "layeredSpines" ? (
        <ShelfStage
          bgSrc={LAYERED_SPINES.bgEstimate}
          decorOverlaySrc={LAYERED_SPINES.overlay}
          placed={placed}
          byId={byId}
          onSelect={setSelected}
          label="分離試作（推定空棚＋透明ネイビー5冊・CSS影）"
          finish="natural"
        />
      ) : view.kind === "compareLayeredSpines" ? (
        <>
          <div className={styles.compareGrid}>
            <ShelfStage
              bgSrc={navySrc}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="採用版（焼き込み complete）"
              finish="natural"
            />
            <ShelfStage
              bgSrc={LAYERED_SPINES.bgEstimate}
              decorOverlaySrc={LAYERED_SPINES.overlay}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="分離試作（推定空棚＋透明5冊）"
              finish="natural"
            />
          </div>
          <section
            className={styles.zoomCompare}
            aria-label="採用版と分離試作の拡大比較"
          >
            <h2 className={styles.zoomTitle}>
              分離試作の拡大比較（右側面・棚奥・接地）
            </h2>
            <p className={styles.zoomLead}>
              真の「本なし」素材は見つかりませんでした。空棚は隣接木目からの推定です。本番未適用・承認待ち。
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/layered-spines-compare-shelf.png"
              alt="棚全体の採用版と分離試作比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/layered-spines-compare-edge.png"
              alt="5冊目右側面〜棚奥の拡大比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/layered-spines-compare-foot.png"
              alt="接地部分の拡大比較"
            />
          </section>
        </>
      ) : view.kind === "newEmptyLayered" ? (
        <ShelfStage
          bgSrc={LAYERED_SPINES.bgNewEmpty}
          decorOverlaySrc={LAYERED_SPINES.overlay}
          placed={placed}
          byId={byId}
          onSelect={setSelected}
          label="新空棚＋透明5冊（ユーザー提供背景・CSS影）"
          finish="natural"
        />
      ) : view.kind === "compareNewEmptyLayered" ? (
        <>
          <div className={styles.compareGrid}>
            <ShelfStage
              bgSrc={navySrc}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="現在の採用版（complete）"
              finish="natural"
            />
            <ShelfStage
              bgSrc={LAYERED_SPINES.bgNewEmpty}
              decorOverlaySrc={LAYERED_SPINES.overlay}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="新空棚＋透明5冊"
              finish="natural"
            />
          </div>
          <section
            className={styles.zoomCompare}
            aria-label="採用版と新空棚分離の拡大比較"
          >
            <h2 className={styles.zoomTitle}>
              新空棚＋透明5冊の拡大比較（右側面・木目・接地）
            </h2>
            <p className={styles.zoomLead}>
              幾何は採用版とほぼ一致（棚板±1px・縦横比同一）。変形なし。本番未適用・承認待ち。
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/newempty-layered-compare-shelf.png"
              alt="棚全体の採用版と新空棚分離比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/newempty-layered-compare-edge.png"
              alt="5冊目右側面と木目の拡大比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/newempty-layered-compare-foot.png"
              alt="棚板への接地の拡大比較"
            />
          </section>
        </>
      ) : view.kind === "newBooksLayered" ? (
        <ShelfStage
          bgSrc={LAYERED_SPINES.bgNewEmpty}
          decorOverlaySrc={LAYERED_SPINES.overlayNewBooks}
          placed={placed}
          byId={byId}
          onSelect={setSelected}
          label="新素材5冊＋新空棚（試作・承認待ち）"
          finish="natural"
        />
      ) : view.kind === "compareNewBooksLayered" ? (
        <>
          <div className={styles.compareGrid}>
            <ShelfStage
              bgSrc={navySrc}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="現在の採用版（complete）"
              finish="natural"
            />
            <ShelfStage
              bgSrc={LAYERED_SPINES.bgNewEmpty}
              decorOverlaySrc={LAYERED_SPINES.overlayNewBooks}
              placed={placed}
              byId={byId}
              onSelect={setSelected}
              label="新素材5冊＋新空棚"
              finish="natural"
            />
          </div>
          <section
            className={styles.zoomCompare}
            aria-label="採用版と新素材5冊の拡大比較"
          >
            <h2 className={styles.zoomTitle}>
              新素材5冊の拡大比較（全体・右側面・接地）
            </h2>
            <p className={styles.zoomLead}>
              上面の切り抜き縁にわずかなハローが残る可能性あり。完成扱いせず確認用です。本番未適用。
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/newbooks-layered-compare-shelf.png"
              alt="5冊全体の採用版と新素材比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/newbooks-layered-compare-edge.png"
              alt="5冊目右側面の拡大比較"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.zoomImg}
              src="/images/ref/newbooks-layered-compare-foot.png"
              alt="接地部分の拡大比較"
            />
          </section>
        </>
      ) : (
        <ShelfStage
          bgSrc={SHELF_BG_VARIANTS[view.variant].src}
          placed={placed}
          byId={byId}
          onSelect={setSelected}
          finish={view.finish}
        />
      )}

      <p className={styles.meta}>
        背景 {SHELF_BG.width}×{SHELF_BG.height} px 基準。動的作品{" "}
        {placed.length} 件（各段 {counts.join(" / ")}）。
        奥行きは棚板上面の接地 Y で調整（3段 sit=432 / 4段 sit=584・110×110）。
        表示: {viewLabel(view)}。
        {" · "}
        <Link href="/dev/image-shelf-preview/compare">完成イメージと比較</Link>
      </p>

      <table className={styles.diffTable}>
        <thead>
          <tr>
            <th>段</th>
            <th>修正前 sitY / y / size</th>
            <th>修正後 sitY / y / size</th>
            <th>棚板上面 (back→lip)</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr key={s.bay}>
              <td>{s.bay + 1}</td>
              <td>
                sit={s.before.sitY} / y={s.before.y} / {s.before.size}×
                {s.before.size}
              </td>
              <td>
                sit={s.after.sitY} / y={s.after.y} / {s.after.size}×
                {s.after.size}
              </td>
              <td>
                {s.board.backY} → {s.board.frontLipY}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected ? (
        <ShelfItemDetail
          item={selected}
          genreLabel={SHELF_TYPE_LABEL[selected.type] ?? selected.type}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
