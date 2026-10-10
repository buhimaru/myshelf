"use client";

import Link from "next/link";
import { useState } from "react";
import { useLockBodyScroll } from "./useLockBodyScroll";

type SiteHeaderProps = {
  active?: "howto" | "about" | "home";
};

export default function SiteHeader({ active }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  useLockBodyScroll(menuOpen);

  return (
    <header className="lp-header">
      <div className="lp-header-inner">
        <Link href="/" className="lp-logo">
          myshelf
        </Link>

        <button
          type="button"
          className="lp-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "閉じる" : "メニュー"}
        </button>

        <nav id="site-nav" className={`lp-nav${menuOpen ? " is-open" : ""}`}>
          <Link
            href="/howto"
            className={`lp-nav-link${active === "howto" ? " is-active" : ""}`}
            onClick={() => setMenuOpen(false)}
          >
            使い方
          </Link>
          <Link
            href="/about"
            className={`lp-nav-link${active === "about" ? " is-active" : ""}`}
            onClick={() => setMenuOpen(false)}
          >
            myshelfについて
          </Link>
          <Link
            href="/?auth=login"
            className="lp-nav-link"
            onClick={() => setMenuOpen(false)}
          >
            ログイン
          </Link>
          <Link
            href="/?auth=start"
            className="lp-nav-cta"
            onClick={() => setMenuOpen(false)}
          >
            はじめる
          </Link>
        </nav>
      </div>
    </header>
  );
}
