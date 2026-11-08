"use client";

import { useEffect, useId, useRef, useState } from "react";
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

type ShelfDisplayNameSettingsProps = {
  user: User;
  onDisplayNameChanged?: (displayName: string | null) => void;
};

export default function ShelfDisplayNameSettings({
  user,
  onDisplayNameChanged,
}: ShelfDisplayNameSettingsProps) {
  const supabase = createClient();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const publicLabel = resolvePublicDisplayName({ displayName: savedName });

  useEffect(() => {
    let cancelled = false;
    const client = createClient();

    const load = async () => {
      setLoading(true);
      setLoadError("");
      setSaveError("");

      const { data, error } = await fetchMyProfile(client, user.id);

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
        setLoading(false);
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

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    if (loading || saving) return;
    setSaveError("");
    setDraft(savedName ?? "");
    setEditing(true);
  };

  const cancelEditing = () => {
    if (saving) return;
    setDraft(savedName ?? "");
    setSaveError("");
    setEditing(false);
  };

  const handleSave = async () => {
    if (saving) return;

    setSaving(true);
    setSaveError("");

    const { data, error } = await updateMyDisplayName(
      supabase,
      user.id,
      draft
    );

    setSaving(false);

    if (error || !data) {
      setSaveError(
        error?.message ||
          "ユーザー名の保存に失敗しました。もう一度お試しください。"
      );
      return;
    }

    const name = data.display_name?.trim() || null;
    setSavedName(name);
    setDraft(name ?? "");
    setEditing(false);
    onDisplayNameChanged?.(name);
  };

  return (
    <div className="my-shelf-display-name-editor">
      {!editing ? (
        <p className="my-shelf-display-name-line" aria-live="polite">
          ユーザー名：
          {loading ? (
            <span
              className="my-shelf-display-name-placeholder"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <span className="my-shelf-display-name-value">{publicLabel}</span>
          )}
          {!loading && (
            <button
              type="button"
              className="my-shelf-display-name-edit-btn"
              onClick={startEditing}
              aria-label="ユーザー名を編集"
              title="ユーザー名を編集"
            >
              <svg
                className="my-shelf-display-name-edit-icon"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4.5 19.5h4L19 9l-4-4L4.5 15.5v4z" />
                <path d="m13.5 6.5 4 4" />
              </svg>
            </button>
          )}
        </p>
      ) : (
        <div className="my-shelf-display-name-edit-row">
          <label className="my-shelf-display-name-edit-prefix" htmlFor={inputId}>
            ユーザー名：
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="my-shelf-display-name-inline-input"
            value={draft}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            placeholder="例: みやび"
            disabled={saving}
            aria-label="ユーザー名"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEditing();
              }
            }}
          />
          <div className="my-shelf-display-name-edit-actions">
            <button
              type="button"
              className="my-shelf-display-name-save-btn"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              className="my-shelf-display-name-cancel-btn"
              disabled={saving}
              onClick={cancelEditing}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {!editing && loadError && (
        <p className="my-shelf-display-name-inline-error" role="alert">
          {loadError}
        </p>
      )}
      {editing && saveError && (
        <p className="my-shelf-display-name-inline-error" role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}
