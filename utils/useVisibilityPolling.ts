import { useEffect, useRef } from "react";

/**
 * @deprecated フォロー同期は useFollowsSync（Realtime + 復帰時再取得）を使う。
 * 互換のため残すが、新規利用は避ける。
 */
export const FOLLOWS_POLL_INTERVAL_MS = 4000;

/**
 * タブが表示中のときだけ定期的に onTick を呼ぶ。
 * @deprecated useFollowsSync を使用してください。
 */
export function useVisibilityPolling(
  enabled: boolean,
  onTick: () => void,
  intervalMs: number = FOLLOWS_POLL_INTERVAL_MS
): void {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let timerId: number | null = null;

    const clearTimer = () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    const tick = () => {
      if (document.visibilityState === "visible") {
        onTickRef.current();
      }
    };

    const startTimer = () => {
      clearTimer();
      if (document.visibilityState !== "visible") return;
      timerId = window.setInterval(tick, intervalMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tick();
        startTimer();
      } else {
        clearTimer();
      }
    };

    if (document.visibilityState === "visible") {
      startTimer();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
