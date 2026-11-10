import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-nav" aria-label="規約・ポリシー">
        <Link href="/terms" className="site-footer-link">
          利用規約
        </Link>
        <span className="site-footer-sep" aria-hidden="true">
          ｜
        </span>
        <Link href="/privacy" className="site-footer-link">
          プライバシーポリシー
        </Link>
        <span className="site-footer-sep" aria-hidden="true">
          ｜
        </span>
        <Link href="/contact" className="site-footer-link">
          お問い合わせ
        </Link>
      </nav>
      <p className="site-footer-copy">© myshelf</p>
    </footer>
  );
}
