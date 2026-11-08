"use client";

/**
 * SVG暫定決定版の独立表示。
 * 接合実験（boardJointShade 等）は入れない。配置パラメータは bDecidedLock を正とする。
 * 今後の画像方式実験ではこのファイルを変更しないこと。
 */

import { useMemo, type CSSProperties } from "react";
import { svgShelfBays } from "../SvgShelfFrame";
import SvgShelfNatural, { REF_B_DEPTH } from "../SvgShelfNatural";
import {
  FORWARD_NUDGE_BY_BAY,
  Jackets,
  geometryFromRefB,
  mappedWorksFromRefB,
  SIZE_BUILDS,
  applyForwardNudge,
  computeSitInset,
  SIZE_VARIANTS,
} from "../SvgShelfBLayoutVerify";
import styles from "../SvgShelfBLayoutVerify.module.css";
import {
  B_DECIDED_DECK_PROFILE,
  B_DECIDED_FORWARD_NUDGE_KEY,
  B_DECIDED_GROUNDING,
  B_DECIDED_LABEL,
  B_DECIDED_SHELF,
} from "./bDecidedLock";

export default function SvgShelfBDecidedView() {
  const geometry = useMemo(() => geometryFromRefB("after"), []);
  const depth = REF_B_DEPTH;
  const look = "ref-b" as const;
  const layout = useMemo(() => svgShelfBays(depth, geometry), [depth, geometry]);
  const built = SIZE_BUILDS.unit;
  const forwardNudge = FORWARD_NUDGE_BY_BAY[B_DECIDED_FORWARD_NUDGE_KEY];
  const works = useMemo(
    () =>
      mappedWorksFromRefB(layout, built.works, B_DECIDED_GROUNDING, forwardNudge),
    [layout, built.works, forwardNudge],
  );
  const ratio = B_DECIDED_SHELF.viewWidth / B_DECIDED_SHELF.viewHeight;

  const insetReport = [0, 1, 2, 3].map((bay) => {
    const b = layout.bays[bay];
    const h = SIZE_VARIANTS.unit.height;
    const baseInset = computeSitInset(b, h, B_DECIDED_GROUNDING);
    const inset = applyForwardNudge(baseInset, bay, forwardNudge);
    return { bay, inset, deckDepth: b.deckDepth };
  });

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>
        {B_DECIDED_LABEL}
        。このページは保存版です。接合・画像実験の結果はここへ反映しません。
      </p>

      {built.fitIssues.length > 0 && (
        <p className={styles.hint} role="status">
          制約: {built.fitIssues.join(" / ")}
        </p>
      )}

      <figure className={styles.panel}>
        <figcaption>暫定決定版（突き当て接合・実験ディテールなし）</figcaption>
        <div
          className={styles.stage}
          style={
            {
              "--shelf-w": String(geometry.viewWidth),
              "--shelf-h": String(geometry.viewHeight),
            } as CSSProperties
          }
        >
          <SvgShelfNatural
            geometry={geometry}
            depth={depth}
            look={look}
            boardJointShade={null}
            between={
              <Jackets
                works={works}
                layout={layout}
                recess
                deckProfile={B_DECIDED_DECK_PROFILE}
                filterSuffix="frozen-decided"
              />
            }
            className={styles.shelfWrap}
          />
        </div>
      </figure>

      <section className={styles.report}>
        <h2>保存ロック</h2>
        <ul>
          <li>
            棚外寸: {B_DECIDED_SHELF.viewWidth} × {B_DECIDED_SHELF.viewHeight}（比{" "}
            {ratio.toFixed(4)}）
          </li>
          <li>
            作品: {SIZE_VARIANTS.unit.width}×{SIZE_VARIANTS.unit.height} / forwardNudge=
            {B_DECIDED_FORWARD_NUDGE_KEY}
          </li>
          <li>
            inset（計算）:{" "}
            {insetReport.map((r) => r.inset.toFixed(2)).join(" / ")}
          </li>
          <li>接合ディテール: なし（boardJointShade=null）</li>
        </ul>
      </section>
    </div>
  );
}
