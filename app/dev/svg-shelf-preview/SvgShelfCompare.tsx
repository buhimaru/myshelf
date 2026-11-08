"use client";

import { useState } from "react";
import SvgShelfBLayoutVerify from "../../../components/SvgShelfBLayoutVerify";
import SvgShelfChic from "../../../components/SvgShelfChic";
import SvgShelfFrame from "../../../components/SvgShelfFrame";
import styles from "../../../components/SvgShelfFrame.module.css";
import SvgShelfGrain from "../../../components/SvgShelfGrain";
import SvgShelfNatural from "../../../components/SvgShelfNatural";
import SvgShelfNaturalWorks from "../../../components/SvgShelfNaturalWorks";
import SvgShelfVintage from "../../../components/SvgShelfVintage";
import SvgShelfWood from "../../../components/SvgShelfWood";

const MODES = [
  { id: "skeleton", label: "SVG骨格（保存版）" },
  { id: "wood", label: "木材・接合部改善版" },
  { id: "vintage", label: "ヴィンテージ木材版" },
  { id: "chic", label: "B参考・シック木材版" },
  { id: "grain", label: "B参考・リアル木目版" },
  { id: "natural", label: "B参考・自然遠近版" },
  { id: "works", label: "自然遠近・作品配置版" },
  { id: "b-layout", label: "B寸法再現・配置検証" },
] as const;

export default function SvgShelfCompare() {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("b-layout");

  return (
    <>
      <div className={styles.switcher} role="group" aria-label="SVG棚の比較">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={mode === option.id ? styles.switchOn : undefined}
            aria-pressed={mode === option.id}
            onClick={() => setMode(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {mode === "works" && (
        <p className={styles.hint}>
          B（約5作品／段）のジャケット寸法を出発点に、棚の幅・段数・段間隔を作品側から再設計した実験です。保存版の固定座標には押し込んでいません。
        </p>
      )}
      {mode === "skeleton" ? (
        <SvgShelfFrame />
      ) : mode === "wood" ? (
        <SvgShelfWood />
      ) : mode === "vintage" ? (
        <SvgShelfVintage />
      ) : mode === "chic" ? (
        <SvgShelfChic />
      ) : mode === "grain" ? (
        <SvgShelfGrain />
      ) : mode === "natural" ? (
        <SvgShelfNatural />
      ) : mode === "b-layout" ? (
        <SvgShelfBLayoutVerify />
      ) : (
        <SvgShelfNaturalWorks />
      )}
    </>
  );
}
