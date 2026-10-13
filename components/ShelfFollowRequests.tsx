"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { PendingFollowRequest } from "../types/follow";
import { createClient } from "../utils/supabase/client";
import {
  acceptFollowRequest,
  fetchPendingFollowRequests,
  followAcceptConfirmMessage,
  notifyFollowsChanged,
  rejectFollowRequest,
} from "../utils/supabase/follow";
import { fetchMyProfile } from "../utils/supabase/profile";
import { useFollowsSync } from "../utils/useFollowsSync";

const SUCCESS_TOAST_MS = 3500;

type ShelfFollowRequestsProps = {
  user: User;
};

export default function ShelfFollowRequests({ user }: ShelfFollowRequestsProps) {
  const [supabase] = useState(() => createClient());
  const [panelOpen, setPanelOpen] = useState(false);
  const [requests, setRequests] = useState<PendingFollowRequest[]>([]);
  const [ownerIsPublic, setOwnerIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const refreshGenerationRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const clearToastTimer = () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const showSuccessToast = useCallback((message: string) => {
    clearToastTimer();
    setActionMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setActionMessage("");
      toastTimerRef.current = null;
    }, SUCCESS_TOAST_MS);
  }, []);

  useEffect(() => {
    return () => {
      clearToastTimer();
    };
  }, []);

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const generation = ++refreshGenerationRef.current;

      if (options?.showLoading) {
        setLoading(true);
      }
      setLoadError("");

      const [requestResult, profileResult] = await Promise.all([
        fetchPendingFollowRequests(supabase, user.id),
        fetchMyProfile(supabase, user.id),
      ]);

      if (generation !== refreshGenerationRef.current) {
        return;
      }

      if (requestResult.error) {
        setLoadError(requestResult.error.message);
        setRequests([]);
        setLoading(false);
        return;
      }

      if (profileResult.data) {
        setOwnerIsPublic(Boolean(profileResult.data.is_public));
      }

      setRequests(requestResult.data);
      setLoading(false);
    },
    [supabase, user.id]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const generation = ++refreshGenerationRef.current;
      setLoading(true);
      setLoadError("");
      setActionError("");

      const [requestResult, profileResult] = await Promise.all([
        fetchPendingFollowRequests(supabase, user.id),
        fetchMyProfile(supabase, user.id),
      ]);

      if (cancelled || generation !== refreshGenerationRef.current) return;

      if (requestResult.error) {
        setLoadError(requestResult.error.message);
        setRequests([]);
        setLoading(false);
        return;
      }

      if (profileResult.data) {
        setOwnerIsPublic(Boolean(profileResult.data.is_public));
      }

      setRequests(requestResult.data);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase, user.id]);

  useFollowsSync(
    supabase,
    user.id,
    () => {
      void refresh();
    },
    {
      enabled: true,
      pollWhileVisible: true,
    }
  );

  const removeRequestLocally = (requestId: string) => {
    refreshGenerationRef.current += 1;
    setRequests((prev) => prev.filter((item) => item.id !== requestId));
    setLoading(false);
  };

  const finishRequestAction = (
    request: PendingFollowRequest,
    message: string
  ) => {
    const remaining = requests.filter((item) => item.id !== request.id).length;
    removeRequestLocally(request.id);
    showSuccessToast(message);
    setActionId(null);
    if (remaining === 0) {
      setPanelOpen(false);
    }
    notifyFollowsChanged();
    void refresh();
  };

  const handleAccept = async (request: PendingFollowRequest) => {
    if (actionId) return;
    if (
      !window.confirm(
        followAcceptConfirmMessage({
          ownerIsPublic,
          requesterIsPublic: request.requesterIsPublic,
        })
      )
    ) {
      return;
    }

    setActionId(request.id);
    setActionError("");

    const { error } = await acceptFollowRequest(supabase, request.id, user.id);

    if (error) {
      setActionError(error.message);
      setActionId(null);
      return;
    }

    const mutual = !ownerIsPublic && request.requesterIsPublic === false;
    finishRequestAction(
      request,
      mutual
        ? `${request.label} を承認しました。お互いの棚を閲覧できます。`
        : `${request.label} を承認しました。`
    );
  };

  const handleReject = async (request: PendingFollowRequest) => {
    if (actionId) return;

    setActionId(request.id);
    setActionError("");

    const { error } = await rejectFollowRequest(supabase, request.id, user.id);

    if (error) {
      setActionError(error.message);
      setActionId(null);
      return;
    }

    finishRequestAction(request, `${request.label} の申請を拒否しました。`);
  };

  // 申請0件でパネルも閉じているときはチップ非表示。完了トースト表示中は残す
  if (
    !panelOpen &&
    !loadError &&
    requests.length === 0 &&
    !actionMessage
  ) {
    return null;
  }

  const count = requests.length;

  return (
    <div className="shelf-follow-requests">
      {(count > 0 || panelOpen || loadError) && (
        <button
          type="button"
          className={`my-shelf-visibility-chip shelf-follow-requests-chip${count > 0 ? " has-requests" : ""}${panelOpen ? " is-open" : ""}`}
          aria-expanded={panelOpen}
          aria-controls="shelf-follow-requests-panel"
          onClick={() => {
            const next = !panelOpen;
            setPanelOpen(next);
            if (next) {
              setActionError("");
              void refresh({ showLoading: true });
            }
          }}
        >
          <span>申請{count > 0 ? ` ${count}` : ""}</span>
        </button>
      )}

      {panelOpen && (
        <div
          id="shelf-follow-requests-panel"
          className="my-shelf-visibility-panel shelf-follow-requests-panel"
          role="region"
          aria-label="フォロー申請"
        >
          <div className="my-shelf-visibility-panel-head">
            <h2 className="my-shelf-visibility-title">フォロー申請</h2>
            <button
              type="button"
              className="my-shelf-visibility-close"
              onClick={() => setPanelOpen(false)}
            >
              閉じる
            </button>
          </div>

          {loading && (
            <p className="my-shelf-visibility-status">読み込み中...</p>
          )}

          {!loading && loadError && <p className="shelf-error">{loadError}</p>}

          {!loading && !loadError && requests.length === 0 && (
            <p className="my-shelf-visibility-note">未処理の申請はありません。</p>
          )}

          {!loading && !loadError && requests.length > 0 && (
            <ul className="shelf-follow-requests-list">
              {requests.map((request) => (
                <li key={request.id} className="shelf-follow-requests-item">
                  <div className="shelf-follow-requests-meta">
                    <p className="shelf-follow-requests-name">{request.label}</p>
                    <p className="shelf-follow-requests-sub">届いた申請</p>
                  </div>
                  <div className="shelf-follow-requests-actions">
                    <button
                      type="button"
                      className="shelf-follow-requests-accept"
                      disabled={Boolean(actionId)}
                      onClick={() => void handleAccept(request)}
                    >
                      {actionId === request.id ? "処理中..." : "承認"}
                    </button>
                    <button
                      type="button"
                      className="shelf-follow-requests-reject"
                      disabled={Boolean(actionId)}
                      onClick={() => void handleReject(request)}
                    >
                      拒否
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {actionError && <p className="shelf-error">{actionError}</p>}
        </div>
      )}

      {actionMessage && (
        <p
          className="shelf-follow-requests-toast my-shelf-visibility-success"
          role="status"
        >
          {actionMessage}
        </p>
      )}
    </div>
  );
}
