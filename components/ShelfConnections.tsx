"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  MyConnectionsBundle,
  ShelfConnectionPerson,
} from "../types/follow";
import { createClient } from "../utils/supabase/client";
import {
  CANCEL_FOLLOW_REQUEST_CONFIRM,
  cancelOutgoingFollowRequest,
  connectionKindLabel,
  fetchMyConnections,
  notifyFollowsChanged,
  removeFollower,
  removeFollowerConfirmMessage,
  unfollowConfirmMessage,
  unfollowShelf,
} from "../utils/supabase/follow";
import { fetchMyProfile } from "../utils/supabase/profile";
import { useFollowsSync } from "../utils/useFollowsSync";

type ShelfConnectionsProps = {
  user: User;
};

const EMPTY_BUNDLE: MyConnectionsBundle = {
  accepted: [],
  outgoingPending: [],
};

export default function ShelfConnections({ user }: ShelfConnectionsProps) {
  const [supabase] = useState(() => createClient());
  const [panelOpen, setPanelOpen] = useState(false);
  const [bundle, setBundle] = useState<MyConnectionsBundle>(EMPTY_BUNDLE);
  const [ownerIsPublic, setOwnerIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const refreshGenerationRef = useRef(0);

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const generation = ++refreshGenerationRef.current;

      if (options?.showLoading) {
        setLoading(true);
      }
      setLoadError("");

      const [connResult, profileResult] = await Promise.all([
        fetchMyConnections(supabase, user.id),
        fetchMyProfile(supabase, user.id),
      ]);

      if (generation !== refreshGenerationRef.current) {
        return;
      }

      if (connResult.error) {
        setLoadError(connResult.error.message);
        setBundle(EMPTY_BUNDLE);
        setLoading(false);
        return;
      }

      if (profileResult.data) {
        setOwnerIsPublic(Boolean(profileResult.data.is_public));
      }

      setBundle(connResult.data);
      setLoading(false);
    },
    [supabase, user.id]
  );

  useEffect(() => {
    if (!panelOpen) {
      setMenuUserId(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const generation = ++refreshGenerationRef.current;
      setLoading(true);
      setLoadError("");
      setActionMessage("");
      setActionError("");
      setMenuUserId(null);

      const [connResult, profileResult] = await Promise.all([
        fetchMyConnections(supabase, user.id),
        fetchMyProfile(supabase, user.id),
      ]);

      if (cancelled || generation !== refreshGenerationRef.current) return;

      if (connResult.error) {
        setLoadError(connResult.error.message);
        setBundle(EMPTY_BUNDLE);
        setLoading(false);
        return;
      }

      if (profileResult.data) {
        setOwnerIsPublic(Boolean(profileResult.data.is_public));
      }

      setBundle(connResult.data);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [panelOpen, user.id, supabase]);

  // Realtime / 復帰時 / 表示中ポーリングで一覧を同期
  useFollowsSync(supabase, user.id, () => {
    void refresh();
  }, {
    enabled: true,
    pollWhileVisible: true,
  });

  useEffect(() => {
    if (!menuUserId) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (listRef.current?.contains(target)) {
        const menuRoot = (target as Element).closest?.(
          "[data-connection-menu]"
        );
        if (menuRoot) return;
      }
      setMenuUserId(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuUserId(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuUserId]);

  const totalCount = bundle.accepted.length + bundle.outgoingPending.length;

  const handleUnfollow = async (person: ShelfConnectionPerson) => {
    if (actionKey) return;
    if (
      !window.confirm(
        unfollowConfirmMessage({
          targetIsPublic: person.isPublic === true,
          viewerIsPublic: ownerIsPublic,
          theyFollowMe: person.theyFollowMe,
        })
      )
    ) {
      setMenuUserId(null);
      return;
    }

    setMenuUserId(null);
    setActionKey(`unfollow:${person.userId}`);
    setActionMessage("");
    setActionError("");

    const { error } = await unfollowShelf(supabase, person.userId);
    setActionKey(null);

    if (error) {
      setActionError(error.message);
      return;
    }

    setActionMessage(`${person.label} のフォローを解除しました。`);
    notifyFollowsChanged();
    await refresh();
  };

  const handleRemoveFollower = async (person: ShelfConnectionPerson) => {
    if (actionKey) return;
    if (
      !window.confirm(
        removeFollowerConfirmMessage({
          ownerIsPublic,
          followerIsPublic: person.isPublic,
          iFollowThem: person.iFollowThem,
        })
      )
    ) {
      setMenuUserId(null);
      return;
    }

    setMenuUserId(null);
    setActionKey(`remove:${person.userId}`);
    setActionMessage("");
    setActionError("");

    const { error } = await removeFollower(supabase, person.userId);
    setActionKey(null);

    if (error) {
      setActionError(error.message);
      return;
    }

    setActionMessage(`${person.label} をフォロワーから解除しました。`);
    notifyFollowsChanged();
    await refresh();
  };

  const handleCancelOutgoing = async (person: ShelfConnectionPerson) => {
    if (actionKey) return;
    if (!window.confirm(CANCEL_FOLLOW_REQUEST_CONFIRM)) return;

    setActionKey(`cancel:${person.userId}`);
    setActionMessage("");
    setActionError("");

    const { error } = await cancelOutgoingFollowRequest(
      supabase,
      person.userId
    );
    setActionKey(null);

    if (error) {
      setActionError(error.message);
      return;
    }

    setActionMessage(`${person.label} への申請を取り消しました。`);
    notifyFollowsChanged();
    await refresh();
  };

  return (
    <>
      <button
        type="button"
        className={`my-shelf-visibility-chip shelf-connections-chip${panelOpen ? " is-open" : ""}`}
        aria-expanded={panelOpen}
        aria-controls="shelf-connections-panel"
        onClick={() => {
          const next = !panelOpen;
          setPanelOpen(next);
          if (next) {
            setActionMessage("");
            setActionError("");
          }
        }}
      >
        <span>つながり</span>
      </button>

      {panelOpen && (
        <div
          id="shelf-connections-panel"
          className="my-shelf-visibility-panel shelf-connections-panel"
          role="region"
          aria-label="つながり一覧"
        >
          <div className="my-shelf-visibility-panel-head">
            <h2 className="my-shelf-visibility-title">つながり</h2>
            <button
              type="button"
              className="my-shelf-visibility-close"
              onClick={() => setPanelOpen(false)}
            >
              閉じる
            </button>
          </div>

          <p className="shelf-connections-lead">
            承認済みのつながりと、送った申請を確認できます。届いた申請は「申請」から確認してください。
          </p>

          {loading && (
            <p className="my-shelf-visibility-status">読み込み中...</p>
          )}

          {!loading && loadError && <p className="shelf-error">{loadError}</p>}

          {!loading && !loadError && totalCount === 0 && (
            <p className="my-shelf-visibility-note">
              まだつながりも申請中もありません。
            </p>
          )}

          {!loading && !loadError && totalCount > 0 && (
            <div className="shelf-connections-sections" ref={listRef}>
              {bundle.outgoingPending.length > 0 && (
                <section className="shelf-connections-section">
                  <h3 className="shelf-connections-section-title">申請中</h3>
                  <ul className="shelf-connections-list">
                    {bundle.outgoingPending.map((person) => {
                      const busy = actionKey === `cancel:${person.userId}`;
                      return (
                        <li
                          key={`out:${person.followId ?? person.userId}`}
                          className="shelf-connections-item"
                        >
                          <div className="shelf-connections-main">
                            <p className="shelf-connections-name is-plain">
                              {person.label}
                            </p>
                            <p className="shelf-connections-relation">
                              {connectionKindLabel(person.kind)}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shelf-connections-inline-action"
                            disabled={Boolean(actionKey)}
                            onClick={() => void handleCancelOutgoing(person)}
                          >
                            {busy ? "処理中..." : "申請を取り消す"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {bundle.accepted.length > 0 && (
                <section className="shelf-connections-section">
                  <h3 className="shelf-connections-section-title">
                    つながっている人
                  </h3>
                  <ul className="shelf-connections-list">
                    {bundle.accepted.map((person) => {
                      const shelfHref = `/shelf/${person.userId}`;
                      const menuOpen = menuUserId === person.userId;
                      const busy =
                        actionKey === `unfollow:${person.userId}` ||
                        actionKey === `remove:${person.userId}`;

                      return (
                        <li
                          key={`acc:${person.userId}`}
                          className="shelf-connections-item"
                        >
                          <div className="shelf-connections-main">
                            <Link
                              href={shelfHref}
                              className="shelf-connections-name"
                            >
                              {person.label}
                            </Link>
                            <p className="shelf-connections-relation">
                              {connectionKindLabel(person.kind)}
                            </p>
                            <Link
                              href={shelfHref}
                              className="shelf-connections-visit"
                            >
                              棚を見る
                            </Link>
                          </div>

                          <div
                            className="shelf-connections-menu"
                            data-connection-menu
                          >
                            <button
                              type="button"
                              className="shelf-connections-menu-trigger"
                              aria-label={`${person.label} のメニュー`}
                              aria-expanded={menuOpen}
                              aria-haspopup="menu"
                              disabled={Boolean(actionKey)}
                              onClick={() => {
                                setMenuUserId((current) =>
                                  current === person.userId
                                    ? null
                                    : person.userId
                                );
                              }}
                            >
                              …
                            </button>

                            {menuOpen && (
                              <div
                                className="shelf-connections-menu-panel"
                                role="menu"
                              >
                                {person.iFollowThem && (
                                  <button
                                    type="button"
                                    className="shelf-connections-menu-item"
                                    role="menuitem"
                                    disabled={busy}
                                    onClick={() => void handleUnfollow(person)}
                                  >
                                    {busy ? "処理中..." : "フォロー解除"}
                                  </button>
                                )}
                                {person.theyFollowMe && (
                                  <button
                                    type="button"
                                    className="shelf-connections-menu-item"
                                    role="menuitem"
                                    disabled={busy}
                                    onClick={() =>
                                      void handleRemoveFollower(person)
                                    }
                                  >
                                    {busy
                                      ? "処理中..."
                                      : "フォロワーから解除"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}

          {actionMessage && (
            <p className="my-shelf-visibility-success" role="status">
              {actionMessage}
            </p>
          )}
          {actionError && <p className="shelf-error">{actionError}</p>}
        </div>
      )}
    </>
  );
}
