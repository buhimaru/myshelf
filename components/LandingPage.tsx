"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { formatAuthErrorMessage } from "../utils/supabase/authMessages";
import {
  isAnonymousAuthUser,
  isRegisteredAuthUser,
} from "../utils/supabase/authUser";
import { createClient } from "../utils/supabase/client";
import {
  buildEmailConfirmRedirectTo,
  clearAllRegistrationUpgradeState,
  clearSignupEmailPending,
  consumeEmailConfirmReturn,
  emailConfirmRedirectHint,
  getConfiguredPublicSiteOrigin,
  getEmailConfirmPending,
  getSignupEmailPending,
  isLoopbackOrigin,
  markRegistrationCompleteNotice,
  planEmailConfirmRedirect,
  setEmailConfirmPending,
  setSignupEmailPending,
} from "../utils/supabase/registrationNotice";
import ShelfPreview from "./ShelfPreview";
import SiteFooter from "./SiteFooter";
import { useLockBodyScroll } from "./useLockBodyScroll";
import { useVisualViewportHeight } from "./useVisualViewportHeight";

type AuthMode = "login" | "start";

type LandingPageProps = {
  /** 既存セッション（ゲスト含む）。ある場合は棚へ戻す導線を出す */
  sessionUser?: User | null;
  initialAuthMode?: AuthMode | null;
  /** メール確認失敗など、親から渡す初期メッセージ */
  initialAuthMessage?: string | null;
  /** 確認戻り・失敗時はログインフォームを優先表示 */
  preferLogin?: boolean;
};

type LandingBoot = {
  email: string;
  authMode: AuthMode;
  showAuth: boolean;
  authMessage: string;
  signupEmailPending: boolean;
};

function readLandingBoot(
  initialAuthMode: AuthMode | null,
  initialAuthMessage: string | null,
  preferLogin: boolean
): LandingBoot {
  const signupEmail = getSignupEmailPending();
  const guestPending = getEmailConfirmPending();
  const pendingEmail = guestPending?.email ?? signupEmail ?? "";
  // Strict Mode の二重初期化でも preferLogin / initialAuthMessage は残る。
  // return 印はここで消費し、ShelfApp 側の重複案内を防ぐ。
  const fromReturn = consumeEmailConfirmReturn();
  const forceLogin =
    preferLogin || Boolean(initialAuthMessage) || fromReturn;

  if (forceLogin) {
    return {
      email: pendingEmail,
      authMode: "login",
      showAuth: true,
      authMessage:
        initialAuthMessage ??
        (fromReturn || preferLogin
          ? "メール確認が完了しました。登録したメールアドレスとパスワードでログインしてください。ゲスト時代の棚がある場合は、同じアカウントで引き継がれます。"
          : ""),
      signupEmailPending: false,
    };
  }

  return {
    email: pendingEmail,
    authMode:
      initialAuthMode === "login"
        ? "login"
        : (initialAuthMode ?? "start"),
    showAuth: Boolean(initialAuthMode),
    authMessage: "",
    signupEmailPending: Boolean(signupEmail),
  };
}

export default function LandingPage({
  sessionUser = null,
  initialAuthMode = null,
  initialAuthMessage = null,
  preferLogin = false,
}: LandingPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const hasSession = Boolean(sessionUser);
  const isGuestSession = isAnonymousAuthUser(sessionUser);
  const isRegisteredSession = isRegisteredAuthUser(sessionUser);
  const [boot] = useState(() =>
    readLandingBoot(initialAuthMode, initialAuthMessage, preferLogin)
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(boot.showAuth);
  const [authMode, setAuthMode] = useState<AuthMode>(boot.authMode);
  const [email, setEmail] = useState(boot.email);
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState(boot.authMessage);
  const [authBusy, setAuthBusy] = useState(false);
  const [signupEmailPending, setSignupEmailPendingState] = useState(
    boot.signupEmailPending
  );
  const [showLoopbackConfirmHint] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      isLoopbackOrigin(window.location.origin) &&
      !getConfiguredPublicSiteOrigin()
    );
  });

  // メニューは position:fixed ロック、認証モーダルは overflow のみ（キーボード時スクロール用）
  useLockBodyScroll(menuOpen, "fixed");
  useLockBodyScroll(showAuth && !menuOpen, "overflow");
  useVisualViewportHeight(showAuth);

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

      const redirectPlan = planEmailConfirmRedirect(window.location.origin);
      const redirectHint = emailConfirmRedirectHint(redirectPlan);
      const emailRedirectTo = buildEmailConfirmRedirectTo(
        window.location.origin
      );

      if (userData.user?.is_anonymous) {
        const { error } = await supabase.auth.updateUser(
          {
            email,
            password,
          },
          { emailRedirectTo }
        );
        if (error) {
          setAuthMessage(formatAuthErrorMessage(error, "update"));
          return;
        }
        setEmailConfirmPending({
          userId: userData.user.id,
          email: email.trim(),
        });
        clearSignupEmailPending();
        setSignupEmailPendingState(false);
        setAuthMessage(
          [
            "確認メールを送信しました。メール内のリンクから確認してください。確認が終わるまでは正式登録は完了していません。別の端末で確認した場合は、確認後にこの画面からログインしてください。",
            redirectHint,
          ]
            .filter(Boolean)
            .join(" ")
        );
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });

      if (error) {
        setAuthMessage(formatAuthErrorMessage(error, "sign_up"));
        return;
      }

      // メール確認必須のとき session は null。確認前に棚へ入らない。
      if (data.session && data.user && !data.user.is_anonymous) {
        clearAllRegistrationUpgradeState();
        return;
      }

      setSignupEmailPending(email.trim());
      setSignupEmailPendingState(true);
      setPassword("");
      setAuthMode("login");
      setAuthMessage(
        [
          "確認メールを送信しました。メール内のリンクを開いて確認したあと、こちらからログインしてください。確認が終わるまでは登録は完了していません。",
          redirectHint,
        ]
          .filter(Boolean)
          .join(" ")
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setAuthMessage(formatAuthErrorMessage(error, "sign_in"));
        return;
      }
      if (data.user && !data.user.is_anonymous) {
        // Landing は未ログイン起点。pending.userId 一致のときだけ昇格完了印を残す。
        const pending = getEmailConfirmPending();
        if (pending && pending.userId === data.user.id) {
          clearAllRegistrationUpgradeState();
          markRegistrationCompleteNotice(data.user.id);
        } else {
          clearAllRegistrationUpgradeState();
        }
        setSignupEmailPendingState(false);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const goToOwnShelf = () => {
    // lp を外して / へ。既存セッションのまま ShelfApp を表示する。
    router.push("/");
  };

  const handleGuestSignIn = async () => {
    // 既存セッションがあるときは新規匿名アカウントを作らない
    if (sessionUser) {
      goToOwnShelf();
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setAuthMessage(formatAuthErrorMessage(error, "sign_in"));
      }
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-header-inner">
          <Link href="/?lp=1" className="lp-logo">
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
            <Link href="/search" className="lp-nav-link" onClick={() => setMenuOpen(false)}>
              棚を探す
            </Link>
            <Link href="/howto" className="lp-nav-link" onClick={() => setMenuOpen(false)}>
              使い方
            </Link>
            <Link href="/about" className="lp-nav-link" onClick={() => setMenuOpen(false)}>
              myshelfについて
            </Link>
            {hasSession ? (
              <Link
                href="/"
                className="lp-nav-cta"
                onClick={() => setMenuOpen(false)}
              >
                自分の棚へ
              </Link>
            ) : (
              <>
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
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {signupEmailPending && (
          <aside className="lp-signup-pending" aria-live="polite">
            <p className="lp-signup-pending-title">確認メールを送信しました</p>
            <p className="lp-signup-pending-body">
              メール内のリンクから確認してください。確認が終わるまでは登録は完了しておらず、自分の棚には入れません。
            </p>
            <p className="lp-signup-pending-body">
              スマホなど別の端末で確認した場合も、確認後にこの画面からログインしてください。自動ではログインされません。
            </p>
            {showLoopbackConfirmHint && (
              <p className="lp-signup-pending-body">
                開発中の localhost
                宛てのリンクはスマホでページを表示できません。認証自体は完了していることが多いので、このPCからログインしてください。
              </p>
            )}
            <button
              type="button"
              className="lp-signup-pending-action"
              onClick={() => {
                setAuthMode("login");
                setShowAuth(true);
                setAuthMessage(
                  "メール確認が終わっていれば、登録したメールアドレスとパスワードでログインできます。"
                );
              }}
            >
              ログインフォームを開く
            </button>
          </aside>
        )}

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
              {hasSession ? (
                <>
                  <Link href="/" className="lp-btn-primary">
                    自分の棚へ戻る
                  </Link>
                  {isGuestSession && (
                    <button
                      type="button"
                      className="lp-btn-text"
                      onClick={() => openAuth("start")}
                    >
                      正式登録する
                    </button>
                  )}
                  {isRegisteredSession && (
                    <button
                      type="button"
                      className="lp-btn-text"
                      onClick={() => openAuth("login")}
                    >
                      別アカウントでログイン
                    </button>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>

          <div className="lp-hero-visual" aria-label="棚のサンプル">
            <ShelfPreview />
          </div>

          <div className="lp-mini-features">
            <h2 className="lp-mini-features-title">myshelfでできること</h2>
            <ul className="lp-mini-features-grid">
              <li className="lp-mini-feature">
                <svg
                  className="lp-mini-feature-icon"
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="10.5" cy="10.5" r="5.25" />
                  <path d="m15 15 4.5 4.5" />
                </svg>
                <span className="lp-mini-feature-label">作品を探す</span>
              </li>
              <li className="lp-mini-feature">
                <svg
                  className="lp-mini-feature-icon"
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect width="8" height="18" x="3" y="3" rx="1" />
                  <path d="M7 3v18" />
                  <path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z" />
                </svg>
                <span className="lp-mini-feature-label">自分の棚をつくる</span>
              </li>
              <li className="lp-mini-feature">
                <svg
                  className="lp-mini-feature-icon"
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect width="7" height="7" x="3" y="3" rx="1" />
                  <rect width="7" height="7" x="14" y="3" rx="1" />
                  <rect width="7" height="7" x="14" y="14" rx="1" />
                  <rect width="7" height="7" x="3" y="14" rx="1" />
                </svg>
                <span className="lp-mini-feature-label">棚を整理する</span>
              </li>
              <li className="lp-mini-feature">
                <svg
                  className="lp-mini-feature-icon"
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8.25" />
                  <path d="M12 3.75v16.5" />
                  <path d="M3.75 12h16.5" />
                  <path d="M6.2 6.2c2 2.4 2.8 5 2.8 5.8s-.8 3.4-2.8 5.8" />
                  <path d="M17.8 6.2c-2 2.4-2.8 5-2.8 5.8s.8 3.4 2.8 5.8" />
                </svg>
                <span className="lp-mini-feature-label">棚を公開する</span>
              </li>
              <li className="lp-mini-feature">
                <svg
                  className="lp-mini-feature-icon"
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="8.5" cy="8" r="2.3" />
                  <circle cx="15.5" cy="8" r="2.3" />
                  <path d="M4.4 18c.55-2.2 2.3-3.4 4.1-3.4s3.55 1.2 4.1 3.4" />
                  <path d="M11.4 18c.55-2.2 2.3-3.4 4.1-3.4s3.55 1.2 4.1 3.4" />
                </svg>
                <span className="lp-mini-feature-label">人とつながる</span>
              </li>
              <li className="lp-mini-feature">
                <svg
                  className="lp-mini-feature-icon"
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m8 11 2 2 4-4" />
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="lp-mini-feature-label">棚を探す</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-features">
          <ul className="lp-feature-list">
            <li>
              <h3>作品を探す</h3>
              <p>
                本・映画・音楽・漫画・ゲームなど、さまざまなジャンルから好きな作品を探せます。
              </p>
            </li>
            <li>
              <h3>自分の棚をつくる</h3>
              <p>
                好きだった作品や忘れられない作品を、ジャンルを超えてひとつの棚に並べられます。
              </p>
            </li>
            <li>
              <h3>棚を整理する</h3>
              <p>
                作品が増えても、ページ分けやジャンル表示で見やすく整理できます。
              </p>
            </li>
            <li>
              <h3>棚を公開する</h3>
              <p>自分の棚を公開するか、非公開にするかを自由に選べます。</p>
            </li>
            <li>
              <h3>人とつながる</h3>
              <p>気になる人をフォローして、お互いの棚を眺められます。</p>
            </li>
            <li>
              <h3>棚を探す</h3>
              <p>
                作品名で検索して、その作品を並べている人の公開棚を探せます。
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

      <SiteFooter />

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
                ? "登録済みのメールアドレスでログインできます。メール確認が終わるまではログインできません。"
                : isGuestSession
                  ? "ゲストの棚を正式登録するか、そのまま自分の棚へ戻れます。"
                  : "新規登録、またはゲストとしてはじめられます。"}
            </p>
            {hasSession && (
              <Link href="/" className="lp-btn-primary lp-auth-shelf-link">
                自分の棚へ戻る
              </Link>
            )}

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
                {hasSession
                  ? "自分の棚へ戻る"
                  : "ゲストとしてはじめる"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
