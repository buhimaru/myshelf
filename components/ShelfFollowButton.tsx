"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { FollowStatus } from "../types/follow";
import { createClient } from "../utils/supabase/client";
import {
  CANCEL_FOLLOW_REQUEST_CONFIRM,
  cancelOutgoingFollowRequest,
  fetchFollowStatus,
  followRequestConfirmMessage,
  followShelf,
  notifyFollowsChanged,
  unfollowConfirmMessage,
  unfollowShelf,
} from "../utils/supabase/follow";
import { fetchMyProfile } from "../utils/supabase/profile";
import { useFollowsSync } from "../utils/useFollowsSync";

type ShelfFollowButtonProps = {
  ownerId: string;
  ownerIsPublic: boolean;
  viewer: User | null;
  onFollowChanged?: (status: FollowStatus) => void;
};

export default function ShelfFollowButton({
  ownerId,
  ownerIsPublic,
  viewer,
  onFollowChanged,
}: ShelfFollowButtonProps) {
  const [supabase] = useState(() => createClient());
  const [status, setStatus] = useState<FollowStatus>("none");
  const [viewerIsPublic, setViewerIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isOwnShelf = Boolean(viewer && viewer.id === ownerId);
  const isRegistered = Boolean(viewer && !viewer.is_anonymous);

  const refreshStatus = useCallback(
    async (options?: { showLoading?: boolean }) => {
      if (!viewer || isOwnShelf || !isRegistered) return;

      if (options?.showLoading) {
        setLoading(true);
      }
      setError("");

      const [statusResult, profileResult] = await Promise.all([
        fetchFollowStatus(supabase, viewer.id, ownerId),
        fetchMyProfile(supabase, viewer.id),
      ]);

      if (statusResult.error) {
        setError(statusResult.error.message);
        // 通信失敗時は権限あり表示を維持しない
        setStatus((prev) => {
          if (prev !== "none") {
            queueMicrotask(() => onFollowChanged?.("none"));
          }
          return "none";
        });
      } else {
        const next = statusResult.status;
        setStatus((prev) => {
          if (prev !== next) {
            queueMicrotask(() => onFollowChanged?.(next));
          }
          return next;
        });
      }

      if (profileResult.data) {
        setViewerIsPublic(Boolean(profileResult.data.is_public));
      }

      if (options?.showLoading) {
        setLoading(false);
      }
    },
    [supabase, viewer, isOwnShelf, isRegistered, ownerId, onFollowChanged]
  );

  useEffect(() => {
    if (isOwnShelf || !isRegistered || !viewer) {
      setStatus("none");
      setViewerIsPublic(false);
      setLoading(false);
      setMessage("");
      setError("");
      return;
    }

    void refreshStatus({ showLoading: true });
  }, [ownerId, viewer?.id, isOwnShelf, isRegistered, refreshStatus]);

  useFollowsSync(
    supabase,
    viewer?.id,
    () => {
      void refreshStatus();
    },
    {
      enabled: Boolean(viewer && isRegistered && !isOwnShelf),
      // pending / accepted の相手操作を、表示中ポーリングでも確実に拾う
      pollWhileVisible: status === "pending" || status === "accepted",
    }
  );

  if (isOwnShelf) {
    return null;
  }

  if (!viewer) {
    return (
      <div className="shelf-follow">
        <p className="shelf-follow-note">
          フォローするには本登録が必要です。
        </p>
        <Link href="/?auth=login" className="shelf-follow-link">
          ログイン / 新規登録
        </Link>
      </div>
    );
  }

  if (viewer.is_anonymous) {
    return (
      <div className="shelf-follow">
        <p className="shelf-follow-note">
          ゲスト中はフォローできません。本登録後に申請できます。
        </p>
        <Link href="/?auth=start" className="shelf-follow-link">
          正式アカウントに登録
        </Link>
      </div>
    );
  }

  const handleFollow = async () => {
    if (busy) return;
    if (
      !window.confirm(
        followRequestConfirmMessage({
          targetIsPublic: ownerIsPublic,
          viewerIsPublic,
        })
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");

    const result = await followShelf(supabase, ownerId);

    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    let nextStatus = result.status;
    if (nextStatus === "none") {
      const refreshed = await fetchFollowStatus(supabase, viewer.id, ownerId);
      if (refreshed.error) {
        setError(refreshed.error.message);
        setBusy(false);
        return;
      }
      nextStatus = refreshed.status;
    }

    setStatus(nextStatus);
    setMessage(
      nextStatus === "accepted"
        ? ownerIsPublic
          ? "フォローしました。"
          : "フォローしました。相手の棚を閲覧できます。"
        : nextStatus === "pending"
          ? "フォローを申請しました。"
          : "フォローを送信しました。"
    );
    onFollowChanged?.(nextStatus);
    notifyFollowsChanged();
    setBusy(false);
  };

  const handleCancelRequest = async () => {
    if (busy) return;
    if (!window.confirm(CANCEL_FOLLOW_REQUEST_CONFIRM)) return;

    setBusy(true);
    setMessage("");
    setError("");

    const result = await cancelOutgoingFollowRequest(supabase, ownerId);

    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    setStatus("none");
    setMessage("申請を取り消しました。");
    onFollowChanged?.("none");
    notifyFollowsChanged();
    setBusy(false);
  };

  const handleUnfollow = async () => {
    if (busy) return;
    if (
      !window.confirm(
        unfollowConfirmMessage({
          targetIsPublic: ownerIsPublic,
          viewerIsPublic,
        })
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");

    const result = await unfollowShelf(supabase, ownerId);

    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    setStatus("none");
    setMessage("フォローを解除しました。");
    onFollowChanged?.("none");
    notifyFollowsChanged();
    setBusy(false);
  };

  return (
    <div className="shelf-follow">
      {loading ? (
        <p className="shelf-follow-note">フォロー状態を確認中...</p>
      ) : status === "none" ? (
        <button
          type="button"
          className="shelf-follow-btn"
          disabled={busy}
          onClick={() => void handleFollow()}
        >
          {busy ? "送信中..." : "フォローする"}
        </button>
      ) : status === "pending" ? (
        <button
          type="button"
          className="shelf-follow-btn is-secondary"
          disabled={busy}
          onClick={() => void handleCancelRequest()}
        >
          {busy ? "処理中..." : "申請を取り消す"}
        </button>
      ) : (
        <button
          type="button"
          className="shelf-follow-btn is-secondary"
          disabled={busy}
          onClick={() => void handleUnfollow()}
        >
          {busy ? "処理中..." : "フォロー解除"}
        </button>
      )}

      {message && (
        <p className="shelf-follow-success" role="status">
          {message}
        </p>
      )}
      {error && <p className="shelf-error">{error}</p>}
    </div>
  );
}
