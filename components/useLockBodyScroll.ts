"use client";

import { useEffect } from "react";

type LockMode = "fixed" | "overflow";

/**
 * 背景スクロールを防ぐ。
 * - fixed: モバイルメニュー向け（位置固定）
 * - overflow: 認証モーダル向け（キーボード表示時の visualViewport / 内側スクロールを阻害しにくい）
 */
export function useLockBodyScroll(
  locked: boolean,
  mode: LockMode = "fixed"
) {
  useEffect(() => {
    if (!locked) return;

    if (mode === "overflow") {
      const { documentElement, body } = document;
      const previous = {
        htmlOverflow: documentElement.style.overflow,
        bodyOverflow: body.style.overflow,
      };
      documentElement.style.overflow = "hidden";
      body.style.overflow = "hidden";
      return () => {
        documentElement.style.overflow = previous.htmlOverflow;
        body.style.overflow = previous.bodyOverflow;
      };
    }

    const scrollY = window.scrollY;
    const { body } = document;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [locked, mode]);
}
