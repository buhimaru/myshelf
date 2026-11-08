"use client";

import styles from "./BookPaperbackCover.module.css";

type BookPaperbackCoverProps = {
  title: string;
  creator?: string | null;
  /** search = 検索結果サムネ / shelf = 棚内フィット / detail = 詳細 */
  variant?: "search" | "shelf" | "detail";
  className?: string;
};

function titleLengthClass(title: string): string {
  const len = title.trim().length;
  if (len > 24) return styles.titleVeryLong;
  if (len > 16) return styles.titleLong;
  if (len > 10) return styles.titleMedium;
  return "";
}

/**
 * 長い日本語題名が不自然な位置で切れないよう、区切りやすい箇所に
 * ゼロ幅スペースを入れる（表示・読み上げ用。DB には保存しない）。
 */
function softBreakTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= 8) return trimmed;

  return trimmed
    .replace(/([・･／/∶:：、，,])/g, "$1\u200B")
    .replace(/([」』】）)])/g, "$1\u200B")
    .replace(/(と)(?=[\u3040-\u30ff\u3400-\u9fffA-Za-z0-9])/g, "$1\u200B")
    .replace(/(の)(?=[\u3040-\u30ff\u3400-\u9fff「『])/g, "$1\u200B")
    .replace(/([ぁ-ん])(?=[ァ-ヶ一-龥])/g, "$1\u200B");
}

/**
 * 本物の表紙が無い本専用の文庫本風代替表示。
 * 画像ファイルは生成せず、タイトル・著者を描画するだけ。
 * DB の image_url や外部送信には使わない。
 */
export default function BookPaperbackCover({
  title,
  creator,
  variant = "search",
  className = "",
}: BookPaperbackCoverProps) {
  const safeTitle = title.trim() || "無題";
  const safeCreator = (creator ?? "").trim();
  const displayTitle = softBreakTitle(safeTitle);
  const variantClass =
    variant === "shelf"
      ? styles.shelfFill
      : variant === "detail"
        ? styles.detail
        : styles.searchHit;

  return (
    <div
      className={`${styles.cover} ${variantClass} ${className}`.trim()}
      role="img"
      aria-label={`${safeTitle}${safeCreator ? `（${safeCreator}）` : ""}の代替表紙`}
    >
      <span className={styles.frame} aria-hidden />
      <span className={styles.frameInner} aria-hidden />
      <div className={styles.body}>
        <p
          className={`${styles.title} ${titleLengthClass(safeTitle)}`.trim()}
        >
          {displayTitle}
        </p>
        {safeCreator ? (
          <>
            <span className={styles.rule} aria-hidden />
            <p className={styles.author}>{safeCreator}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
