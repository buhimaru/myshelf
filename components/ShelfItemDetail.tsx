"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { MediaItem, MediaType } from "../types/media";
import { DESCRIPTION_MAX_LENGTH } from "../utils/shelfDisplay";
import {
  formatCreatorWithRole,
  parseStoredCreatorCredit,
} from "../utils/tmdb/credits";
import BookPaperbackCover from "./BookPaperbackCover";
import { useLockBodyScroll } from "./useLockBodyScroll";

export type ShelfItemDetailEditState = {
  title: string;
  creator: string;
  imageUrl: string;
  description: string;
  type: MediaType | "";
  error: string;
  showAnimeDramaOption: boolean;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onCreatorChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTypeChange: (value: MediaType | "") => void;
  onSave: () => void;
  onCancel: () => void;
};

type ShelfItemDetailProps = {
  item: MediaItem;
  genreLabel: string;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** 詳細モーダル内編集。渡されているときだけ編集UIを表示 */
  edit?: ShelfItemDetailEditState | null;
};

export default function ShelfItemDetail({
  item,
  genreLabel,
  onClose,
  onEdit,
  onDelete,
  edit = null,
}: ShelfItemDetailProps) {
  const [mounted, setMounted] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const [detailItemId, setDetailItemId] = useState(item.id);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const descriptionBoxRef = useRef<HTMLDivElement | null>(null);
  const descriptionContentRef = useRef<HTMLDivElement | null>(null);
  const collapsedBoxHeightRef = useRef(0);
  const isEditing = Boolean(edit);
  useLockBodyScroll(true);

  const description = item.description?.trim() ?? "";

  // 作品切替は描画中に状態を揃え、古い展開状態での誤計測を防ぐ
  if (item.id !== detailItemId) {
    setDetailItemId(item.id);
    setDescriptionExpanded(false);
    setDescriptionOverflows(false);
    collapsedBoxHeightRef.current = 0;
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCoverBroken(false);
  }, [item.id, item.imageUrl]);

  /** ジャケット実寸の縦横比から自由記入欄の基本高さを決める（CSS変数へ反映） */
  const syncDescriptionHeightFromCover = useCallback(() => {
    const layout = layoutRef.current;
    const cover = coverRef.current;
    if (!layout || !cover) return;
    const width = cover.clientWidth;
    const height = cover.clientHeight;
    if (width <= 0 || height <= 0) return;

    const aspect = width / height;
    let descPx: number;
    if (aspect < 0.78) {
      // 縦長（文庫・漫画など）
      descPx = 200;
    } else if (aspect <= 1.2) {
      // 正方形寄り（音楽など）
      descPx = Math.min(148, Math.max(112, Math.round(height * 0.64)));
    } else {
      // 横長
      descPx = Math.min(120, Math.max(96, Math.round(height * 0.92)));
    }
    layout.style.setProperty("--shelf-detail-desc-h", `${descPx}px`);
  }, []);

  const readCollapsedDescHeight = useCallback(() => {
    const layout = layoutRef.current;
    const box = descriptionBoxRef.current;
    if (layout) {
      const raw = getComputedStyle(layout)
        .getPropertyValue("--shelf-detail-desc-h")
        .trim();
      if (raw.endsWith("px")) {
        const px = Number.parseFloat(raw);
        if (Number.isFinite(px) && px > 0) return px;
      }
      if (raw.endsWith("rem")) {
        const rem = Number.parseFloat(raw);
        if (Number.isFinite(rem) && rem > 0) {
          const root = Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize
          );
          return rem * (Number.isFinite(root) ? root : 16);
        }
      }
    }
    return box?.clientHeight ?? 0;
  }, []);

  const measureDescriptionOverflow = useCallback(() => {
    const box = descriptionBoxRef.current;
    const content = descriptionContentRef.current;
    if (!box || !content || !description) {
      setDescriptionOverflows(false);
      return;
    }

    const limit = readCollapsedDescHeight();
    if (limit <= 0) {
      setDescriptionOverflows(false);
      return;
    }

    const cs = getComputedStyle(box);
    const paddingY =
      Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
    const innerLimit = Math.max(0, limit - (Number.isFinite(paddingY) ? paddingY : 0));

    collapsedBoxHeightRef.current = limit;
    // 枠の overflow / 展開状態に依らず、本文高さと基本高さ（内側）を比較する
    setDescriptionOverflows(content.scrollHeight > innerLimit + 1);
  }, [description, readCollapsedDescHeight]);

  useLayoutEffect(() => {
    if (!mounted || isEditing) return;
    syncDescriptionHeightFromCover();
    measureDescriptionOverflow();
  }, [
    mounted,
    isEditing,
    syncDescriptionHeightFromCover,
    measureDescriptionOverflow,
    description,
    descriptionExpanded,
    coverBroken,
    item.id,
    item.imageUrl,
  ]);

  useEffect(() => {
    if (!mounted || isEditing) return;
    const cover = coverRef.current;
    const box = descriptionBoxRef.current;
    const content = descriptionContentRef.current;
    if (!cover || !box || !content) return;

    const schedule = () => {
      window.requestAnimationFrame(() => {
        syncDescriptionHeightFromCover();
        measureDescriptionOverflow();
      });
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(cover);
    observer.observe(box);
    observer.observe(content);
    // 代替表紙など画像 onLoad が無い場合の初回同期
    schedule();
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [
    mounted,
    isEditing,
    syncDescriptionHeightFromCover,
    measureDescriptionOverflow,
    description,
    item.id,
    coverBroken,
    item.imageUrl,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (edit) {
        edit.onCancel();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, edit]);

  if (!mounted) return null;

  const parsed = parseStoredCreatorCredit(item.creator, item.type);
  const creatorLine = parsed
    ? formatCreatorWithRole(parsed.roleLabel, parsed.text)
    : "";
  const showRealCover = Boolean(item.imageUrl?.trim()) && !coverBroken;
  const showBookPaperback = item.type === "book" && !showRealCover;
  const showFallbackOnly = !showRealCover && !showBookPaperback;
  const showActions = Boolean(onEdit && onDelete) && !isEditing;
  const coverClassName = [
    "my-shelf-cover",
    "shelf-detail-cover",
    showRealCover ? "shelf-detail-cover--image" : "",
    showBookPaperback ? "shelf-detail-cover--paperback" : "",
    showFallbackOnly ? "shelf-detail-cover--fallback" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleBackdropClick = () => {
    if (edit) {
      edit.onCancel();
      return;
    }
    onClose();
  };

  return createPortal(
    <div className="shelf-detail-backdrop" onClick={handleBackdropClick}>
      <div
        className={`shelf-detail${isEditing ? " shelf-detail--editing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          isEditing ? "shelf-detail-edit-title" : "shelf-detail-title"
        }
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="shelf-detail-close"
          onClick={() => {
            if (edit) {
              edit.onCancel();
              return;
            }
            onClose();
          }}
          autoFocus={!isEditing}
        >
          {isEditing ? "キャンセル" : "閉じる"}
        </button>

        {edit ? (
          <div className="shelf-detail-edit">
            <h2 id="shelf-detail-edit-title" className="shelf-detail-edit-heading">
              作品を編集
            </h2>
            {edit.error ? <p className="shelf-error">{edit.error}</p> : null}
            <div className="shelf-form shelf-detail-edit-form">
              <label className="shelf-field">
                作品名
                <input
                  type="text"
                  placeholder="作品名を入力"
                  value={edit.title}
                  onChange={(e) => edit.onTitleChange(e.target.value)}
                  disabled={edit.saving}
                />
              </label>
              <label className="shelf-field">
                作者・監督・アーティスト（任意）
                <input
                  type="text"
                  placeholder="未入力でも登録できます"
                  value={edit.creator}
                  onChange={(e) => edit.onCreatorChange(e.target.value)}
                  disabled={edit.saving}
                />
              </label>
              <label className="shelf-field">
                画像URL（任意）
                <input
                  type="text"
                  placeholder="未入力でも登録できます"
                  value={edit.imageUrl}
                  onChange={(e) => edit.onImageUrlChange(e.target.value)}
                  disabled={edit.saving}
                />
              </label>
              <label className="shelf-field">
                自由記入欄（任意）
                <textarea
                  rows={5}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  placeholder="未入力でも登録できます"
                  value={edit.description}
                  onChange={(e) => edit.onDescriptionChange(e.target.value)}
                  disabled={edit.saving}
                />
                <span className="shelf-field-count">
                  {edit.description.trim().length}/{DESCRIPTION_MAX_LENGTH}
                </span>
              </label>
              <label className="shelf-field">
                ジャンル
                <select
                  value={edit.type}
                  onChange={(e) =>
                    edit.onTypeChange(e.target.value as MediaType | "")
                  }
                  disabled={edit.saving}
                >
                  <option value="">カテゴリーを選択</option>
                  <option value="book">本</option>
                  <option value="manga">漫画</option>
                  <option value="movie">映画</option>
                  <option value="music">音楽</option>
                  <option value="game">ゲーム</option>
                  {edit.showAnimeDramaOption ? (
                    <>
                      <option value="anime">アニメ</option>
                      <option value="drama">ドラマ</option>
                    </>
                  ) : null}
                </select>
              </label>
              <div className="shelf-detail-edit-actions">
                <button
                  type="button"
                  className="shelf-form-submit"
                  onClick={edit.onSave}
                  disabled={edit.saving}
                >
                  {edit.saving ? "保存中..." : "変更を保存"}
                </button>
                <button
                  type="button"
                  className="shelf-detail-edit-cancel"
                  onClick={edit.onCancel}
                  disabled={edit.saving}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={layoutRef}
            className={`shelf-detail-layout my-shelf-item--${item.type}`}
          >
            <div className="shelf-detail-media">
              <div ref={coverRef} className={coverClassName}>
                {showBookPaperback ? (
                  <BookPaperbackCover
                    title={item.title}
                    creator={item.creator}
                    variant="detail"
                  />
                ) : showFallbackOnly ? (
                  <div className="my-shelf-cover-fallback" aria-hidden="true">
                    <span>{genreLabel}</span>
                  </div>
                ) : (
                  <img
                    src={item.imageUrl ?? ""}
                    alt=""
                    onLoad={syncDescriptionHeightFromCover}
                    onError={() => setCoverBroken(true)}
                  />
                )}
              </div>
              {showActions ? (
                <div className="shelf-detail-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit?.(item.id);
                    }}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete?.(item.id);
                    }}
                  >
                    削除
                  </button>
                </div>
              ) : null}
            </div>
            <div className="shelf-detail-copy">
              <h2 id="shelf-detail-title" className="shelf-detail-title">
                {item.title}
              </h2>
              {creatorLine ? (
                <p className="shelf-detail-creator">{creatorLine}</p>
              ) : null}
              <p className="shelf-detail-genre">{genreLabel}</p>
              <section
                className="shelf-detail-section"
                aria-label="自由記入欄"
              >
                <h3 className="shelf-detail-heading">自由記入欄</h3>
                <div className="shelf-detail-description-shell">
                  <div
                    ref={descriptionBoxRef}
                    className={[
                      "shelf-detail-description-box",
                      descriptionExpanded
                        ? "shelf-detail-description-box--expanded"
                        : "shelf-detail-description-box--collapsed",
                      !descriptionExpanded && descriptionOverflows
                        ? "shelf-detail-description-box--fade"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div
                      ref={descriptionContentRef}
                      className="shelf-detail-description-content"
                    >
                      {description ? (
                        <p className="shelf-detail-description">
                          {description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {descriptionOverflows ? (
                    <button
                      type="button"
                      className="shelf-detail-description-toggle"
                      aria-expanded={descriptionExpanded}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDescriptionExpanded((current) => !current);
                      }}
                    >
                      {descriptionExpanded ? "▲ 閉じる" : "▼ 続きを見る"}
                    </button>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
