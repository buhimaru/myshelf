"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

type ShelfSettingsModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 追加クラス（例: shelf-connections-modal） */
  className?: string;
  /** 未保存変更がある場合など。false を返すと閉じない */
  onBeforeClose?: () => boolean;
};

export default function ShelfSettingsModal({
  open,
  title,
  onClose,
  children,
  className = "",
  onBeforeClose,
}: ShelfSettingsModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onBeforeCloseRef = useRef(onBeforeClose);
  onCloseRef.current = onClose;
  onBeforeCloseRef.current = onBeforeClose;

  const requestClose = () => {
    if (onBeforeCloseRef.current && !onBeforeCloseRef.current()) return;
    onCloseRef.current();
  };

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const scrollbarGap =
      window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }

    const focusTimer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (onBeforeCloseRef.current && !onBeforeCloseRef.current()) return;
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  };

  return createPortal(
    <div
      className="shelf-settings-modal-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={`shelf-settings-modal${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shelf-settings-modal-head">
          <h2 id={titleId} className="shelf-settings-modal-title">
            {title}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="shelf-settings-modal-close"
            aria-label="閉じる"
            onClick={requestClose}
          >
            ×
          </button>
        </div>
        <div className="shelf-settings-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
