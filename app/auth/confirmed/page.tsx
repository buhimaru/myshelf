"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { formatAuthCallbackErrorMessage } from "../../../utils/supabase/authMessages";
import { subscribeAuthUser } from "../../../utils/supabase/authUser";
import { createClient } from "../../../utils/supabase/client";
import {
  markEmailConfirmReturn,
  readAuthCallbackErrorFromLocation,
  stripAuthCallbackParamsFromUrl,
} from "../../../utils/supabase/registrationNotice";

type ConfirmView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success_logged_in"; email: string | null }
  | { kind: "success_need_login" };

function readInitialView(searchString: string): ConfirmView {
  const query = searchString ? `?${searchString}` : "";
  const callbackError = readAuthCallbackErrorFromLocation(query);
  markEmailConfirmReturn();
  if (callbackError) {
    stripAuthCallbackParamsFromUrl();
    return {
      kind: "error",
      message: formatAuthCallbackErrorMessage(callbackError),
    };
  }
  return { kind: "loading" };
}

function AuthConfirmedContent() {
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const [view, setView] = useState<ConfirmView>(() =>
    readInitialView(searchParams.toString())
  );

  useEffect(() => {
    if (view.kind === "error") return;

    let cancelled = false;
    let settled = false;

    const finishSuccess = (user: User | null) => {
      if (cancelled || settled) return;
      settled = true;
      stripAuthCallbackParamsFromUrl();
      if (user && !user.is_anonymous) {
        setView({
          kind: "success_logged_in",
          email: user.email ?? null,
        });
        return;
      }
      setView({ kind: "success_need_login" });
    };

    const unsub = subscribeAuthUser(supabase, (user) => {
      if (user && !user.is_anonymous) {
        finishSuccess(user);
      }
    });

    const timer = window.setTimeout(() => {
      void supabase.auth.getUser().then(({ data }) => {
        finishSuccess(data.user);
      });
    }, 2800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub();
    };
  }, [supabase, view.kind]);

  return (
    <div className="auth-confirmed">
      <header className="auth-confirmed-header">
        <Link href="/" className="auth-confirmed-logo">
          myshelf
        </Link>
      </header>

      <main className="auth-confirmed-main">
        {view.kind === "loading" && (
          <p className="auth-confirmed-status" aria-live="polite">
            メール確認を処理しています...
          </p>
        )}

        {view.kind === "error" && (
          <section className="auth-confirmed-card" aria-live="polite">
            <h1 className="auth-confirmed-title">メール確認に失敗しました</h1>
            <p className="auth-confirmed-body">{view.message}</p>
            <div className="auth-confirmed-actions">
              <Link href="/?auth=login" className="auth-confirmed-btn-primary">
                ログイン画面を開く
              </Link>
              <Link href="/?auth=start" className="auth-confirmed-btn-secondary">
                新規登録に戻る
              </Link>
            </div>
          </section>
        )}

        {view.kind === "success_logged_in" && (
          <section className="auth-confirmed-card" aria-live="polite">
            <h1 className="auth-confirmed-title">
              メールアドレスの確認が完了しました
            </h1>
            <p className="auth-confirmed-body">
              正式アカウントの準備ができました。自分の棚を開けます。
            </p>
            <div className="auth-confirmed-actions">
              <Link href="/" className="auth-confirmed-btn-primary">
                自分の棚を開く
              </Link>
            </div>
          </section>
        )}

        {view.kind === "success_need_login" && (
          <section className="auth-confirmed-card" aria-live="polite">
            <h1 className="auth-confirmed-title">
              メールアドレスの確認が完了しました
            </h1>
            <p className="auth-confirmed-body">
              認証は完了しています。別の端末で登録を始めた場合や、この端末にまだログインしていない場合は、登録したメールアドレスとパスワードでログインしてください。
            </p>
            <p className="auth-confirmed-body">
              登録を始めたPCでは、確認後にログイン案内が出ます。自動ではログインされません。
            </p>
            <div className="auth-confirmed-actions">
              <Link href="/?auth=login" className="auth-confirmed-btn-primary">
                ログインする
              </Link>
              <Link href="/" className="auth-confirmed-btn-secondary">
                トップへ戻る
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function AuthConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-confirmed">
          <p className="auth-confirmed-status" aria-live="polite">
            読み込み中...
          </p>
        </div>
      }
    >
      <AuthConfirmedContent />
    </Suspense>
  );
}
