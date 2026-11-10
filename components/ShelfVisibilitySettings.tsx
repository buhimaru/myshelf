"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../utils/supabase/client";
import { fetchMyProfile, updateMyShelfPublic } from "../utils/supabase/profile";
import {
  announceShelfSettingsModal,
  subscribeShelfSettingsModalExclusive,
} from "../utils/shelfSettingsModalExclusive";
import ShelfSettingsModal from "./ShelfSettingsModal";

type ShelfVisibilitySettingsProps = {
  user: User;
  onRequestRegister?: () => void;
};

function LockIcon() {
  return (
    <svg
      className="my-shelf-visibility-chip-icon"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function PublicIcon() {
  return (
    <svg
      className="my-shelf-visibility-chip-icon"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 3.75v16.5" />
      <path d="M3.75 12h16.5" />
      <path d="M6.2 6.2c2 2.4 2.8 5 2.8 5.8s-.8 3.4-2.8 5.8" />
      <path d="M17.8 6.2c-2 2.4-2.8 5-2.8 5.8s.8 3.4 2.8 5.8" />
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

  useEffect(() => {
    return subscribeShelfSettingsModalExclusive("visibility", () => {
      setPanelOpen(false);
    });
  }, []);

  useEffect(() => {
    if (panelOpen) {
      announceShelfSettingsModal("visibility");
    }
  }, [panelOpen]);

  const openModal = () => {
    setSaveMessage("");
    setSaveError("");
    setPanelOpen(true);
  };

  const closeModal = () => {
    setPanelOpen(false);
  };

  const handleToggle = async (nextPublic: boolean) => {
    if (isAnonymous || saving) return;

    setSaving(true);
    setSaveMessage("");
    setSaveError("");

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

  const chipLabel = loading ? "…" : isPublic ? "公開" : "非公開";

  return (
    <>
      <button
        type="button"
        className={`my-shelf-visibility-chip${isPublic ? " is-public" : " is-private"}${panelOpen ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={() => {
          if (panelOpen) {
            closeModal();
            return;
          }
          openModal();
        }}
      >
        {isPublic ? <PublicIcon /> : <LockIcon />}
        <span>{chipLabel}</span>
      </button>

      <ShelfSettingsModal
        open={panelOpen}
        title="棚の公開設定"
        onClose={closeModal}
      >
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
                    onClick={() => {
                      closeModal();
                      onRequestRegister();
                    }}
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
              </>
            )}
          </>
        )}
      </ShelfSettingsModal>
    </>
  );
}
