"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "../utils/supabase/client";
import ShelfPreview from "./ShelfPreview";
import { useLockBodyScroll } from "./useLockBodyScroll";

type AuthMode = "login" | "start";

type LandingPageProps = {
  initialAuthMode?: AuthMode | null;
};

export default function LandingPage({ initialAuthMode = null }: LandingPageProps) {
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(Boolean(initialAuthMode));
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode ?? "start");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  useLockBodyScroll(menuOpen);

  useEffect(() => {
    if (!initialAuthMode) return;
    setAuthMode(initialAuthMode);
    setShowAuth(true);
  }, [initialAuthMode]);

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthMessage("");
    setShowAuth(true);
    setMenuOpen(false);
  };

  const handleSignUp = async () => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (userData.user?.is_anonymous) {
        const { error } = await supabase.auth.updateUser({
          email,
          password,
        });
        if (error) {
          setAuthMessage("アカウント登録に失敗しました: " + error.message);
          return;
        }
        setAuthMessage("確認メールを送信しました。メールを確認してください。");
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        setAuthMessage("新規登録に失敗しました: " + error.message);
        return;
      }

      setAuthMessage("登録手続きを開始しました。メールを確認してください。");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setAuthMessage("ログインに失敗しました: " + error.message);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGuestSignIn = async () => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setAuthMessage("ゲストログインに失敗しました: " + error.message);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-header-inner">
          <Link href="/" className="lp-logo">
            myshelf
          </Link>

          <button
            type="button"
            className="lp-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="lp-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "閉じる" : "メニュー"}
          </button>

          <nav
            id="lp-nav"
            className={`lp-nav${menuOpen ? " is-open" : ""}`}
          >
            <Link href="/howto" className="lp-nav-link" onClick={() => setMenuOpen(false)}>
              使い方
            </Link>
            <Link href="/about" className="lp-nav-link" onClick={() => setMenuOpen(false)}>
              myshelfについて
            </Link>
            <button
              type="button"
              className="lp-nav-link lp-nav-button"
              onClick={() => openAuth("login")}
            >
              ログイン
            </button>
            <button
              type="button"
              className="lp-nav-cta"
              onClick={() => openAuth("start")}
            >
              はじめる
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-brand">myshelf</p>
            <h1 className="lp-hero-title">
              <span className="lp-hero-title-line">
                あなたの中に残っている作品を、
              </span>
              <span className="lp-hero-title-line">ひとつの棚に。</span>
            </h1>
            <p className="lp-hero-sub">本も、映画も、音楽も、漫画も。</p>
            <p className="lp-hero-desc">
              <span className="lp-hero-desc-line">
                好きだった作品、忘れられない作品を、
              </span>
              <span className="lp-hero-desc-line">
                ジャンルを超えて自由に並べられます。
              </span>
            </p>
            <div className="lp-hero-actions">
              <button
                type="button"
                className="lp-btn-primary"
                onClick={() => openAuth("start")}
              >
                今すぐはじめる
              </button>
              <button
                type="button"
                className="lp-btn-text"
                onClick={() => openAuth("login")}
              >
                すでにアカウントがある方はログイン
              </button>
            </div>
          </div>

          <ShelfPreview />
        </section>

        <section className="lp-features">
          <h2 className="lp-section-title">できること</h2>
          <ul className="lp-feature-list">
            <li>
              <h3>作品を検索して追加</h3>
              <p>本・映画・音楽などを検索し、自分の棚へ追加できます。</p>
            </li>
            <li>
              <h3>ジャンルを超えて一つの棚に</h3>
              <p>違う種類の作品も、ひとつのコレクションとして並べられます。</p>
            </li>
            <li>
              <h3>自分の棚を自由に編集</h3>
              <p>追加した作品の編集や削除で、棚を自分好みに整えられます。</p>
            </li>
            <li>
              <h3>公開・非公開や他の棚を見る</h3>
              <p>
                将来の機能として検討中です。現時点ではまだ利用できません。
              </p>
            </li>
          </ul>
        </section>

        <section className="lp-closing">
          <p className="lp-closing-message">好きな作品と、ずっとそばに。</p>
          <div className="lp-closing-body">
            <p>ふとした時に思い出すあの作品。</p>
            <p>何度も読み返したあの本、心を動かされたあの音楽。</p>
            <p>
              myshelfは、そんな大切な作品たちを集めて、あなただけの棚に並べるアプリです。
            </p>
          </div>
          <Link href="/about" className="lp-closing-link">
            myshelfについて
          </Link>
        </section>
      </main>

      {showAuth && (
        <div className="lp-auth-overlay" role="dialog" aria-modal="true" aria-labelledby="lp-auth-title">
          <div className="lp-auth-panel">
            <div className="lp-auth-header">
              <h2 id="lp-auth-title">
                {authMode === "login" ? "ログイン" : "はじめる"}
              </h2>
              <button
                type="button"
                className="lp-auth-close"
                onClick={() => setShowAuth(false)}
              >
                閉じる
              </button>
            </div>

            <p className="lp-auth-lead">
              {authMode === "login"
                ? "登録済みのメールアドレスでログインできます。"
                : "新規登録、またはゲストとしてはじめられます。"}
            </p>

            <label className="lp-auth-field">
              メールアドレス
              <input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>

            <label className="lp-auth-field">
              パスワード
              <input
                type="password"
                placeholder="パスワード"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
              />
            </label>

            {authMessage && <p className="lp-auth-message">{authMessage}</p>}

            <div className="lp-auth-actions">
              {authMode === "login" ? (
                <button
                  type="button"
                  className="lp-btn-primary"
                  onClick={handleSignIn}
                  disabled={authBusy}
                >
                  ログイン
                </button>
              ) : (
                <button
                  type="button"
                  className="lp-btn-primary"
                  onClick={handleSignUp}
                  disabled={authBusy}
                >
                  新規登録
                </button>
              )}
              <button
                type="button"
                className="lp-btn-secondary"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "start" : "login");
                  setAuthMessage("");
                }}
                disabled={authBusy}
              >
                {authMode === "login" ? "新規登録はこちら" : "ログインはこちら"}
              </button>
              <button
                type="button"
                className="lp-btn-text"
                onClick={handleGuestSignIn}
                disabled={authBusy}
              >
                ゲストとしてはじめる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
