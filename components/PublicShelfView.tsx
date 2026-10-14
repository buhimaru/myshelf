"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { FollowStatus } from "../types/follow";
import type { MediaItem } from "../types/media";
import type { Profile } from "../types/profile";
import {
  SHELF_TYPE_LABEL,
  filterAndSortShelfItems,
  resolvePublicDisplayName,
  isValidAuthUuid,
} from "../utils/shelfDisplay";
import { subscribeAuthUser } from "../utils/supabase/authUser";
import { createClient } from "../utils/supabase/client";
import { loadPublicShelf } from "../utils/supabase/shelf";
import { useFollowsSync } from "../utils/useFollowsSync";
import ShelfFollowButton from "./ShelfFollowButton";

type PublicShelfViewProps = {
  userId: string;
};

type ViewState =
  | { status: "loading" }
  | { status: "invalid_id" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "private"; profile: Profile }
  | { status: "ok"; profile: Profile; items: MediaItem[] };

export default function PublicShelfView({ userId }: PublicShelfViewProps) {
  const [supabase] = useState(() => createClient());
  const [viewer, setViewer] = useState<User | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const viewRef = useRef<ViewState>(view);
  viewRef.current = view;

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");

  useEffect(() => {
    return subscribeAuthUser(supabase, (next) => {
      setViewer(next);
      setViewerReady(true);
    });
  }, [supabase]);

  useEffect(() => {
    if (!viewerReady) return;

    let cancelled = false;

    const load = async () => {
      const previous = viewRef.current;
      const softReload =
        previous.status === "ok" || previous.status === "private";

      if (!softReload) {
        setView({ status: "loading" });
      }

      if (!isValidAuthUuid(userId)) {
        if (!cancelled) setView({ status: "invalid_id" });
        return;
      }

      const result = await loadPublicShelf(supabase, userId, viewer);

      if (cancelled) return;

      if (result.kind === "not_found") {
        setView({ status: "not_found" });
        return;
      }

      if (result.kind === "error") {
        // 通信失敗時: 非公開作品を表示し続けない
        if (
          previous.status === "ok" &&
          previous.profile &&
          !previous.profile.is_public
        ) {
          setView({ status: "private", profile: previous.profile });
          return;
        }
        if (previous.status === "private") {
          setView(previous);
          return;
        }
        setView({ status: "error", message: result.message });
        return;
      }

      if (result.kind === "private") {
        setView({ status: "private", profile: result.profile });
        return;
      }

      setView({
        status: "ok",
        profile: result.profile,
        items: result.items,
      });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [viewerReady, userId, viewer, reloadToken, supabase]);

  const requestShelfReload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const handleFollowChanged = useCallback((status: FollowStatus) => {
    if (status === "accepted" || status === "none") {
      setReloadToken((token) => token + 1);
    }
  }, []);

  // 承認待ちの非公開棚など、相手操作を表示中に確実に拾う
  const awaitingFollowSync =
    viewerReady &&
    Boolean(viewer && !viewer.is_anonymous && viewer.id !== userId) &&
    (view.status === "private" || view.status === "ok");

  useFollowsSync(supabase, viewer?.id, requestShelfReload, {
    enabled: awaitingFollowSync,
    // Realtime 未達時でも、開いたまま承認されると数秒以内に反映
    pollWhileVisible: true,
  });

  const handleResetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setSortOrder("newest");
  };

  const visibleItems =
    view.status === "ok"
      ? filterAndSortShelfItems(view.items, {
          searchQuery,
          categoryFilter,
          sortOrder,
        })
      : [];

  const ownerLabel =
    view.status === "ok" || view.status === "private"
      ? resolvePublicDisplayName({
          displayName: view.profile.display_name,
          usernameForLegacyCheck: view.profile.username,
        })
      : "";

  const showFollow =
    (view.status === "ok" || view.status === "private") &&
    !(viewer && viewer.id === userId);

  return (
    <div className="my-shelf public-shelf">
      <header className="my-shelf-topbar">
        <div className="my-shelf-topbar-inner">
          <Link href="/" className="my-shelf-logo-link">
            myshelf
          </Link>
          <div className="my-shelf-account">
            <Link href="/" className="my-shelf-text-btn">
              自分の棚へ
            </Link>
          </div>
        </div>
      </header>

      <main className="my-shelf-main">
        {view.status === "loading" && (
          <p className="public-shelf-message" aria-live="polite">
            読み込み中...
          </p>
        )}

        {view.status === "invalid_id" && (
          <section className="public-shelf-state" aria-live="polite">
            <h1 className="public-shelf-state-title">無効な棚URLです</h1>
            <p className="public-shelf-state-body">
              共有リンクの形式が正しくありません。
            </p>
            <Link href="/" className="btn-primary public-shelf-home-link">
              トップへ戻る
            </Link>
          </section>
        )}

        {view.status === "not_found" && (
          <section className="public-shelf-state" aria-live="polite">
            <h1 className="public-shelf-state-title">棚が見つかりません</h1>
            <p className="public-shelf-state-body">
              このユーザーの棚は存在しないか、表示できません。
            </p>
            <Link href="/" className="btn-primary public-shelf-home-link">
              トップへ戻る
            </Link>
          </section>
        )}

        {view.status === "error" && (
          <section className="public-shelf-state" aria-live="polite">
            <h1 className="public-shelf-state-title">読み込みに失敗しました</h1>
            <p className="public-shelf-state-body">
              通信エラーが発生しました。時間をおいて再度お試しください。
            </p>
            <p className="public-shelf-state-detail">{view.message}</p>
            <Link href="/" className="btn-primary public-shelf-home-link">
              トップへ戻る
            </Link>
          </section>
        )}

        {view.status === "private" && (
          <section className="public-shelf-state" aria-live="polite">
            <h1 className="public-shelf-state-title">この棚は非公開です</h1>
            <p className="public-shelf-state-body">
              フォローが承認されると、この非公開の棚を閲覧できます。
            </p>
            {showFollow && (
              <div className="public-shelf-follow-wrap">
                <ShelfFollowButton
                  ownerId={userId}
                  ownerIsPublic={false}
                  viewer={viewer}
                  onFollowChanged={handleFollowChanged}
                />
              </div>
            )}
            <Link href="/" className="btn-primary public-shelf-home-link">
              トップへ戻る
            </Link>
          </section>
        )}

        {view.status === "ok" && (
          <>
            <section className="my-shelf-intro public-shelf-intro">
              <div className="public-shelf-heading-row">
                <h1 className="my-shelf-heading">{ownerLabel}の棚</h1>
              </div>
              <p className="my-shelf-desc">
                {view.profile.is_public
                  ? "公開中の棚です。"
                  : "フォロー承認により閲覧できる非公開の棚です。"}
              </p>
              {showFollow && (
                <div className="public-shelf-follow-wrap">
                  <ShelfFollowButton
                    ownerId={userId}
                    ownerIsPublic={Boolean(view.profile.is_public)}
                    viewer={viewer}
                    onFollowChanged={handleFollowChanged}
                  />
                </div>
              )}
            </section>

            <section className="my-shelf-toolbar">
              <input
                className="my-shelf-control"
                type="text"
                placeholder="作品名・作者名で検索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="my-shelf-control"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">すべてのカテゴリ</option>
                <option value="book">本</option>
                <option value="manga">漫画</option>
                <option value="movie">映画</option>
                <option value="music">音楽</option>
                <option value="game">ゲーム</option>
                <option value="anime">アニメ</option>
                <option value="drama">ドラマ</option>
              </select>
              <select
                className="my-shelf-control"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <option value="newest">新しい順</option>
                <option value="oldest">古い順</option>
                <option value="title">作品名順</option>
              </select>
              <button
                type="button"
                className="my-shelf-reset"
                onClick={handleResetFilters}
              >
                リセット
              </button>
            </section>

            <section className="my-shelf-collection">
              <p className="my-shelf-count">{visibleItems.length}件の作品</p>

              {view.items.length === 0 && (
                <p className="my-shelf-empty">まだ作品がありません。</p>
              )}

              {view.items.length > 0 && visibleItems.length === 0 && (
                <p className="my-shelf-empty">該当する作品がありません。</p>
              )}

              <div className="my-shelf-grid">
                {visibleItems.map((item) => (
                  <article
                    key={item.id}
                    className={`my-shelf-item my-shelf-item--${item.type}`}
                  >
                    <div className="my-shelf-cover">
                      <div
                        className="my-shelf-cover-fallback"
                        aria-hidden="true"
                      >
                        <span>{SHELF_TYPE_LABEL[item.type] ?? "作品"}</span>
                      </div>
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                    </div>
                    <div className="my-shelf-meta">
                      <h2 className="my-shelf-item-title">{item.title}</h2>
                      <p className="my-shelf-item-creator">
                        {item.creator || "作者不明"}
                      </p>
                      <p className="my-shelf-item-type">
                        {SHELF_TYPE_LABEL[item.type] ?? item.type}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
