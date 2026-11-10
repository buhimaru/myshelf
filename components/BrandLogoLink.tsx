import Link from "next/link";

type BrandLogoLinkProps = {
  href?: string;
  className?: string;
};

/**
 * ヘッダー左上の共通ロゴ（棚線画アイコン + myshelf テキスト）。
 * クリック時の遷移先は既存どおり維持する。
 */
export default function BrandLogoLink({
  href = "/?lp=1",
  className = "",
}: BrandLogoLinkProps) {
  return (
    <Link href={href} className={`brand-logo ${className}`.trim()}>
      {/* 装飾。隣接テキスト「myshelf」が名称を担う */}
      <img
        src="/brand/myshelf-header-mark.png"
        alt=""
        width={22}
        height={22}
        className="brand-logo-mark"
        decoding="async"
        draggable={false}
      />
      <span className="brand-logo-text">myshelf</span>
    </Link>
  );
}
