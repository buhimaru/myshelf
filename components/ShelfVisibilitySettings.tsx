"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../utils/supabase/client";
import {
  buildShelfShareUrl,
  fetchMyProfile,
  updateMyShelfPublic,
} from "../utils/supabase/profile";

type ShelfVisibilitySettingsProps = {
  user: User;
  onRequestRegister?: () => void;
};

function LockIcon() {
  return (
    <svg
      className="my-shelf-visibility-chip-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8 1.5A2.5 2.5 0 0 0 5.5 4v2H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4A2.5 2.5 0 0 0 8 1.5zm1.5 4.5h-3V4a1.5 1.5 0 1 1 3 0v2z"
      />
    </svg>
  );
}

function PublicIcon() {
  return (
    <svg
      className="my-shelf-visibility-chip-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM2.6 8h2.1c.1 1.5.5 2.9 1.1 4A5 5 0 0 1 2.6 8zm3.1 0h4.6c-.1 1.7-.6 3.2-1.3 4.3-.4.6-.8 1-1 1.2-.2-.2-.6-.6-1-1.2C6.3 11.2 5.8 9.7 5.7 8zm4.6 0h2.1a5 5 0 0 1-3.2 4c.6-1.1 1-2.5 1.1-4zM8 2.6c.2.2.6.6 1 1.2.7 1.1 1.2 2.6 1.3 4.2H5.7c.1-1.6.6-3.1 1.3-4.2.4-.6.8-1 1-1.2z"
      />
    </svg>
  );
}

export default function ShelfVisibilitySettings({
  user,
  onRequestRegister,
}: ShelfVisibilitySettingsProps) {
  const supabase = createClient();
  const isAnonymous = Boolean(user.is_anonymous);

  const [panelOpen, setPanelOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const shareUrl = buildShelfShareUrl(user.id);

  useEffect(() => {
    let cancelled = false;
    const client = createClient();

    const load = async () => {
      setLoading(true);
      setLoadError("");
      setSaveMessage("");
      setSaveError("");

      const { data, error } = await fetchMyProfile(client, user.id);

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setLoadError("プロフィールが見つかりませんでした。");
        setLoading(false);
        return;
      }

      setIsPublic(Boolean(data.is_public));
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const handleToggle = async (nextPublic: boolean) => {
    if (isAnonymous || saving) return;

    setSaving(true);
    setSaveMessage("");
    setSaveError("");
    setCopyMessage("");

    const { data, error } = await updateMyShelfPublic(
      supabase,
      user.id,
      nextPublic
    );

    setSaving(false);

    if (error || !data) {
      setSaveError(
        error?.message || "公開設定の保存に失敗しました。もう一度お試しください。"
      );
      return;
    }

    setIsPublic(Boolean(data.is_public));
    setSaveMessage(data.is_public ? "棚を公開しました。" : "棚を非公開にしました。");
  };

  const handleCopy = async () => {
    setCopyMessage("");
    setSaveError("");

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMessage("コピーしました。");
    } catch {
      setCopyMessage("");
      setSaveError("コピーに失敗しました。");
    }
  };

  const chipLabel = loading ? "…" : isPublic ? "公開" : "非公開";

  return (
    <>
      <button
        type="button"
        className={`my-shelf-visibility-chip${isPublic ? " is-public" : " is-private"}${panelOpen ? " is-open" : ""}`}
        aria-expanded={panelOpen}
        aria-controls="shelf-visibility-panel"
        onClick={() => setPanelOpen((open) => !open)}
      >
        {isPublic ? <PublicIcon /> : <LockIcon />}
        <span>{chipLabel}</span>
      </button>

      {panelOpen && (
        <div
          id="shelf-visibility-panel"
          className="my-shelf-visibility-panel"
          role="region"
          aria-label="棚の公開設定"
        >
          <div className="my-shelf-visibility-panel-head">
            <h2 className="my-shelf-visibility-title">棚の公開設定</h2>
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

          {!loading && !loadError && (
            <>
              <p className="my-shelf-visibility-status">
                現在:{" "}
                <span
                  className={
                    isPublic
                      ? "my-shelf-visibility-badge is-public"
                      : "my-shelf-visibility-badge is-private"
                  }
                >
                  {isPublic ? "公開" : "非公開"}
                </span>
              </p>

              {isAnonymous ? (
                <div className="my-shelf-visibility-anon">
                  <p className="my-shelf-visibility-note">
                    ゲスト中は非公開のままです。公開や共有には本登録が必要です。
                  </p>
                  {onRequestRegister && (
                    <button
                      type="button"
                      className="my-shelf-text-btn"
                      onClick={onRequestRegister}
                    >
                      正式アカウントに登録
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="my-shelf-visibility-actions">
                    <button
                      type="button"
                      className={`my-shelf-visibility-toggle${isPublic ? "" : " is-active"}`}
                      disabled={saving || !isPublic}
                      onClick={() => void handleToggle(false)}
                    >
                      非公開にする
                    </button>
                    <button
                      type="button"
                      className={`my-shelf-visibility-toggle${isPublic ? " is-active" : ""}`}
                      disabled={saving || isPublic}
                      onClick={() => void handleToggle(true)}
                    >
                      公開する
                    </button>
                  </div>

                  {saving && (
                    <p className="my-shelf-visibility-status">保存中...</p>
                  )}
                  {saveMessage && (
                    <p className="my-shelf-visibility-success" role="status">
                      {saveMessage}
                    </p>
                  )}
                  {saveError && <p className="shelf-error">{saveError}</p>}

                  <div className="my-shelf-visibility-share">
                    <p className="my-shelf-visibility-share-label">共有用リンク</p>
                    <div className="my-shelf-visibility-share-row">
                      <input
                        type="text"
                        className="my-shelf-visibility-share-input"
                        value={shareUrl}
                        readOnly
                        aria-label="共有用リンク"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        className="my-shelf-visibility-copy"
                        onClick={() => void handleCopy()}
                      >
                        コピー
                      </button>
                    </div>
                    {copyMessage && (
                      <p className="my-shelf-visibility-success" role="status">
                        {copyMessage}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
