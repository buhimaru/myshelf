"use client";

import { useEffect } from "react";

const HEIGHT_VAR = "--app-vv-height";
const OFFSET_TOP_VAR = "--app-vv-offset-top";

/**
 * キーボード表示などで変わる visualViewport の高さと上端オフセットを CSS 変数へ反映する。
 * 固定モーダルを実表示領域に合わせ、内側スクロールを可能にする。
 */
export function useVisualViewportHeight(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const root = document.documentElement;
    const viewport = window.visualViewport;

    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      if (!Number.isFinite(height) || height <= 0) return;
      root.style.setProperty(HEIGHT_VAR, `${Math.round(height)}px`);
      root.style.setProperty(
        OFFSET_TOP_VAR,
        `${Math.round(Number.isFinite(offsetTop) ? offsetTop : 0)}px`
      );
    };

    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty(HEIGHT_VAR);
      root.style.removeProperty(OFFSET_TOP_VAR);
    };
  }, [active]);
}
