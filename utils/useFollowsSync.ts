import { useEffect, useRef } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { FOLLOWS_CHANGED_EVENT } from "./supabase/follow";

export const FOLLOWS_VISIBLE_POLL_MS = 4000;

export type UseFollowsSyncOptions = {
  enabled?: boolean;
  /**
   * タブ表示中のみ軽いポーリングを行う。
   * Realtime 未設定・RLS でイベントが届かない場合の保険。
   */
  pollWhileVisible?: boolean;
  pollIntervalMs?: number;
};

/**
 * フォロー関係の画面同期:
 * - 同一タブ: FOLLOWS_CHANGED_EVENT
 * - 他タブ/他アカウント: Supabase Realtime（follows）
 * - 保険: focus / タブ再表示時の再取得
 * - 追加保険: pollWhileVisible 時のみ表示中ポーリング
 */
export function useFollowsSync(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  onChange: () => void,
  options: boolean | UseFollowsSyncOptions = true
): void {
  const normalized: UseFollowsSyncOptions =
    typeof options === "boolean" ? { enabled: options } : options;

  const enabled = normalized.enabled !== false;
  const pollWhileVisible = Boolean(normalized.pollWhileVisible);
  const pollIntervalMs = normalized.pollIntervalMs ?? FOLLOWS_VISIBLE_POLL_MS;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const instanceIdRef = useRef(
    `i${Math.random().toString(36).slice(2, 10)}`
  );

  useEffect(() => {
    if (!enabled || !userId || typeof window === "undefined") return;

    let debounceTimer: number | null = null;
    let pollTimer: number | null = null;
    let channel: RealtimeChannel | null = null;

    const clearDebounce = () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };

    const clearPoll = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const emit = () => {
      clearDebounce();
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        onChangeRef.current();
      }, 120);
    };

    const onLocalEvent = () => emit();
    const onFocus = () => emit();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        emit();
        startPoll();
      } else {
        clearPoll();
      }
    };

    const startPoll = () => {
      clearPoll();
      if (!pollWhileVisible) return;
      if (document.visibilityState !== "visible") return;
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          emit();
        }
      }, pollIntervalMs);
    };

    window.addEventListener(FOLLOWS_CHANGED_EVENT, onLocalEvent);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    channel = supabase
      .channel(`myshelf-follows-sync:${userId}:${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${userId}`,
        },
        () => emit()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follows",
          filter: `following_id=eq.${userId}`,
        },
        () => emit()
      )
      .subscribe((status) => {
        // SUBSCRIBED 以外でも focus/poll で同期する（Realtime 未設定を許容）
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") {
          // no-op: 代替策は poll / focus
        }
      });

    startPoll();

    return () => {
      clearDebounce();
      clearPoll();
      window.removeEventListener(FOLLOWS_CHANGED_EVENT, onLocalEvent);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [supabase, userId, enabled, pollWhileVisible, pollIntervalMs]);
}
