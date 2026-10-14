"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  DISPLAY_NAME_MAX_LENGTH,
  resolvePublicDisplayName,
} from "../utils/shelfDisplay";
import { createClient } from "../utils/supabase/client";
import {
  fetchMyProfile,
  updateMyDisplayName,
} from "../utils/supabase/profile";

/** 保存成功メッセージ表示後、パネルを閉じるまでの待ち時間 */
const SAVE_SUCCESS_CLOSE_MS = 1000;

type ShelfDisplayNameSettingsProps = {
  user: User;
  onDisplayNameChanged?: (displayName: string | null) => void;
};

export default function ShelfDisplayNameSettings({
  user,
  onDisplayNameChanged,
}: ShelfDisplayNameSettingsProps) {
  const supabase = createClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const closeTimerRef = useRef<number | null>(null);

  const publicLabel = resolvePublicDisplayName({ displayName: savedName });

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closePanel = useCallback(() => {
    clearCloseTimer();
    setSaveMessage("");
    setPanelOpen(false);
  }, [clearCloseTimer]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  useEffect(() => {
    let cancelled = false;
    const client = createClient();

    const load = async () => {
      setLoading(true);
      setLoadError("");
      clearCloseTimer();
      setSaveMessage("");
      setSaveError("");

      const { data, error } = await fetchMyProfile(client, user.id);

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
        setLoading(false);
        // 取得完了を親へ伝え、読み込み中のプレースホルダーを解消する
        onDisplayNameChanged?.(null);
        return;
      }

      if (!data) {
        setLoadError("プロフィールが見つかりませんでした。");
        setLoading(false);
        onDisplayNameChanged?.(null);
        return;
      }

      const name = data.display_name?.trim() || null;
      setSavedName(name);
      setDraft(name ?? "");
      setLoading(false);
      onDisplayNameChanged?.(name);
    };

    void load();

    return () => {
      cancelled = true;
    };
    // onDisplayNameChanged は親の setState 想定のため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const handleSave = async () => {
    if (saving) return;

    setSaving(true);
    clearCloseTimer();
    setSaveMessage("");
    setSaveError("");

    const { data, error } = await updateMyDisplayName(
      supabase,
      user.id,
      draft
    );

    setSaving(false);

    if (error || !data) {
      setSaveError(
        error?.message || "表示名の保存に失敗しました。もう一度お試しください。"
      );
      return;
    }

    const name = data.display_name?.trim() || null;
    setSavedName(name);
    setDraft(name ?? "");
    setSaveMessage("表示名を保存しました。");
    onDisplayNameChanged?.(name);

    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setSaveMessage("");
      setPanelOpen(false);
    }, SAVE_SUCCESS_CLOSE_MS);
  };

  const chipLabel = loading ? "…" : "表示名";

  return (
    <>
      <button
        type="button"
        className={`my-shelf-visibility-chip shelf-display-name-chip${panelOpen ? " is-open" : ""}`}
        aria-expanded={panelOpen}
        aria-controls="shelf-display-name-panel"
        onClick={() => {
          if (panelOpen) {
            closePanel();
            return;
          }
          clearCloseTimer();
          setSaveMessage("");
          setSaveError("");
          setDraft(savedName ?? "");
          setPanelOpen(true);
        }}
      >
        <span>{chipLabel}</span>
      </button>

      {panelOpen && (
        <div
          id="shelf-display-name-panel"
          className="my-shelf-visibility-panel shelf-display-name-panel"
          role="region"
          aria-label="表示名の編集"
        >
          <div className="my-shelf-visibility-panel-head">
            <h2 className="my-shelf-visibility-title">表示名を編集</h2>
            <button
              type="button"
              className="my-shelf-visibility-close"
              onClick={closePanel}
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
                現在の表示: <strong>{publicLabel}</strong>
              </p>
              <p className="my-shelf-visibility-note">
                つながり一覧や他人から見える名前です。未設定のままでも棚は使えます。
              </p>

              <label className="shelf-display-name-label" htmlFor="shelf-display-name-input">
                表示名
              </label>
              <input
                id="shelf-display-name-input"
                type="text"
                className="shelf-display-name-input"
                value={draft}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                placeholder="例: みやび"
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSave();
                  }
                }}
              />
              <p className="shelf-display-name-hint">
                前後の空白は除き、1〜{DISPLAY_NAME_MAX_LENGTH}文字で保存します（
                {draft.trim().length}/{DISPLAY_NAME_MAX_LENGTH}）
              </p>

              <div className="shelf-display-name-actions">
                <button
                  type="button"
                  className="shelf-display-name-save"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? "保存中..." : "保存する"}
                </button>
              </div>

              {saveMessage && (
                <p className="my-shelf-visibility-success" role="status">
                  {saveMessage}
                </p>
              )}
              {saveError && <p className="shelf-error">{saveError}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
