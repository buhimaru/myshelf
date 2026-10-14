import { useCallback, useEffect, useRef, useState } from "react";

/** 成功メッセージの標準表示時間 */
export const UI_SUCCESS_TOAST_MS = 3500;

/**
 * 成功トースト用。一定時間後に自動消去する。
 * エラー表示には使わない（手動クリア前提）。
 */
export function useAutoDismissMessage(durationMs = UI_SUCCESS_TOAST_MS) {
  const [message, setMessage] = useState("");
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearTimer();
    setMessage("");
  }, [clearTimer]);

  const show = useCallback(
    (next: string) => {
      clearTimer();
      setMessage(next);
      timerRef.current = window.setTimeout(() => {
        setMessage("");
        timerRef.current = null;
      }, durationMs);
    },
    [clearTimer, durationMs]
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { message, show, clear };
}
