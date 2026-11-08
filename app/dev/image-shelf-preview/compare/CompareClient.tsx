"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { COVER_SHELF_RICH_ITEMS } from "../../cover-shelf-preview/items";
import {
  CONCEPT_REF_BOXES,
  SHELF_BG,
  SHELF_CONCEPT,
  formatBox,
  layoutDummyCovers,
  toPercent,
} from "../shelfLayout";
import styles from "./compare.module.css";

const DUMMY_COUNT = 20;

function delta(a: number, b: number) {
  return Math.round(a - b);
}

export default function CompareClient() {
  const items = useMemo(
    () =>
      COVER_SHELF_RICH_ITEMS.filter((item) => Boolean(item.imageUrl)).slice(
        0,
        DUMMY_COUNT,
      ),
    [],
  );

  const placed = useMemo(
    () => layoutDummyCovers(items.map((i) => i.id)),
    [items],
  );

  const byId = useMemo(() => {
    const map = new Map(items.map((i) => [i.id, i]));
    return map;
  }, [items]);

  const rows = CONCEPT_REF_BOXES.map((ref) => {
    const impl = placed.find((p) => p.bay === ref.bay && p.slot === ref.slot);
    return { ref, impl };
  });

  return (
    <div className={styles.root}>
      <p className={styles.nav}>
        <Link href="/dev/image-shelf-preview">← 試作に戻る</Link>
      </p>

      <div className={styles.grid}>
        <figure className={styles.panel}>
          <figcaption className={styles.caption}>
            ① 完成イメージ（参照）赤枠 = 実測ボックス
          </figcaption>
          <div
            className={styles.stage}
            style={{
              aspectRatio: `${SHELF_CONCEPT.width} / ${SHELF_CONCEPT.height}`,
            }}
          >
            <Image
              src={SHELF_CONCEPT.src}
              alt="完成イメージ"
              width={SHELF_CONCEPT.width}
              height={SHELF_CONCEPT.height}
              className={styles.bg}
              unoptimized
              priority
            />
            <div className={styles.coverLayer}>
              {CONCEPT_REF_BOXES.map((box) => {
                const pct = toPercent(box);
                return (
                  <div
                    key={`ref-${box.bay}-${box.slot}`}
                    className={styles.overlayBox}
                    style={{
                      left: pct.left,
                      top: pct.top,
                      width: pct.width,
                      height: pct.height,
                    }}
                    title={`bay${box.bay + 1} #${box.slot + 1} ${formatBox(box)}`}
                  />
                );
              })}
            </div>
          </div>
        </figure>

        <figure className={styles.panel}>
          <figcaption className={styles.caption}>
            ② 実装（空棚＋動的配置）青枠 = 配置ボックス
          </figcaption>
          <div
            className={styles.stage}
            style={{ aspectRatio: `${SHELF_BG.width} / ${SHELF_BG.height}` }}
          >
            <Image
              src={SHELF_BG.src}
              alt="空の棚背景"
              width={SHELF_BG.width}
              height={SHELF_BG.height}
              className={styles.bg}
              unoptimized
              priority
            />
            <div className={styles.coverLayer}>
              {placed.map((p) => {
                const item = byId.get(p.itemId);
                const pct = toPercent(p);
                return (
                  <div key={p.itemId}>
                    {item?.imageUrl ? (
                      <div
                        className={styles.cover}
                        style={{
                          left: pct.left,
                          top: pct.top,
                          width: pct.width,
                          height: pct.height,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt=""
                          className={styles.coverImg}
                          draggable={false}
                        />
                      </div>
                    ) : null}
                    <div
                      className={`${styles.overlayBox} ${styles.overlayBoxImpl}`}
                      style={{
                        left: pct.left,
                        top: pct.top,
                        width: pct.width,
                        height: pct.height,
                      }}
                      title={`bay${p.bay + 1} #${p.slot + 1} ${formatBox(p)}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </figure>
      </div>

      <p className={styles.legend}>
        座標は背景 1024×664 基準（px）。差分 = 実装 − 完成イメージ実測。
        棚板高さは空棚と完成イメージでわずかに異なるため、Y
        は棚板上面への接地を優先しています。
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>段</th>
              <th>#</th>
              <th>完成イメージ (x,y w×h)</th>
              <th>実装 (x,y w×h)</th>
              <th>Δx</th>
              <th>Δy</th>
              <th>Δw</th>
              <th>Δh</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ref, impl }) => {
              const dx = impl ? delta(impl.x, ref.x) : null;
              const dy = impl ? delta(impl.y, ref.y) : null;
              const dw = impl ? delta(impl.width, ref.width) : null;
              const dh = impl ? delta(impl.height, ref.height) : null;
              const cell = (v: number | null) => {
                if (v == null) return "—";
                const abs = Math.abs(v);
                const cls =
                  abs <= 8 ? styles.diffOk : abs <= 24 ? styles.diff : styles.diffWarn;
                return <span className={`${styles.diff} ${cls}`}>{v}</span>;
              };
              return (
                <tr key={`${ref.bay}-${ref.slot}`}>
                  <td>{ref.bay + 1}</td>
                  <td>{ref.slot + 1}</td>
                  <td>{formatBox(ref)}</td>
                  <td>{impl ? formatBox(impl) : "—"}</td>
                  <td>{cell(dx)}</td>
                  <td>{cell(dy)}</td>
                  <td>{cell(dw)}</td>
                  <td>{cell(dh)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
