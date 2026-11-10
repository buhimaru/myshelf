"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { buildShelfShareUrl } from "../utils/supabase/profile";
import {
  announceShelfSettingsModal,
  subscribeShelfSettingsModalExclusive,
} from "../utils/shelfSettingsModalExclusive";
import ShelfSettingsModal from "./ShelfSettingsModal";

type ShelfShareButtonProps = {
  user: User;
};

const SHARE_TEXT = "私のmyshelfを見てみてください。";

function ShareIcon() {
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
      <circle cx="6.5" cy="12" r="2.1" />
      <circle cx="16.5" cy="6.5" r="2.1" />
      <circle cx="16.5" cy="17.5" r="2.1" />
      <path d="m8.3 11 6-3.3M8.3 13l6 3.3" />
    </svg>
  );
}

export default function ShelfShareButton({ user }: ShelfShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [copyError, setCopyError] = useState("");
  const shareUrl = buildShelfShareUrl(user.id);

  useEffect(() => {
    return subscribeShelfSettingsModalExclusive("share", () => {
      setOpen(false);
    });
  }, []);

  useEffect(() => {
    if (open) {
      announceShelfSettingsModal("share");
    }
  }, [open]);

  const handleCopy = async () => {
    setCopyMessage("");
    setCopyError("");
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMessage("コピーしました。");
    } catch {
      setCopyError("コピーに失敗しました。");
    }
  };

  const handleShareX = () => {
    const href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      SHARE_TEXT
    )}&url=${encodeURIComponent(shareUrl)}`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const handleShareLine = () => {
    const href = `https://line.me/R/msg/text/?${encodeURIComponent(
      `${SHARE_TEXT}\n${shareUrl}`
    )}`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <button
        type="button"
        className={`my-shelf-visibility-chip my-shelf-share-chip${open ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next) {
              setCopyMessage("");
              setCopyError("");
            }
            return next;
          });
        }}
      >
        <ShareIcon />
        <span>シェア</span>
      </button>

      <ShelfSettingsModal
        open={open}
        title="棚をシェア"
        onClose={() => setOpen(false)}
        className="my-shelf-share-modal"
      >
        <p className="my-shelf-visibility-note">
          自分の棚のURLを共有できます。非公開の棚は、閲覧権限のある人にしか表示されません。共有しても公開設定は変わりません。
        </p>

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
          <div
            className="my-shelf-visibility-share-actions"
            role="group"
            aria-label="SNSでシェア"
          >
            <button
              type="button"
              className="my-shelf-visibility-share-btn"
              onClick={handleShareX}
            >
              Xでシェア
            </button>
            <button
              type="button"
              className="my-shelf-visibility-share-btn"
              onClick={handleShareLine}
            >
              LINEでシェア
            </button>
          </div>
          {copyMessage && (
            <p className="my-shelf-visibility-success" role="status">
              {copyMessage}
            </p>
          )}
          {copyError && <p className="shelf-error">{copyError}</p>}
        </div>
      </ShelfSettingsModal>
    </>
  );
}
