"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import LandingPage from "../components/LandingPage";
import ShelfApp from "../components/ShelfApp";
import { formatAuthCallbackErrorMessage } from "../utils/supabase/authMessages";
import { subscribeAuthUser } from "../utils/supabase/authUser";
import { createClient } from "../utils/supabase/client";
import {
  hasEmailConfirmCallbackSignals,
  markEmailConfirmReturn,
  readAuthCallbackErrorFromLocation,
  stripAuthCallbackParamsFromUrl,
} from "../utils/supabase/registrationNotice";

type CallbackBoot = {
  errorMessage: string | null;
  preferLogin: boolean;
  waiting: boolean;
};

function readCallbackBoot(searchString: string): CallbackBoot {
  const query = searchString ? `?${searchString}` : "";
  const callbackError = readAuthCallbackErrorFromLocation(query);
  const confirmed =
    new URLSearchParams(searchString).get("email_confirmed") === "1";
  const hasSignals = hasEmailConfirmCallbackSignals(query);

  if (confirmed) {
    markEmailConfirmReturn();
  }
  if (confirmed || callbackError) {
    stripAuthCallbackParamsFromUrl();
  }

  return {
    errorMessage: callbackError
      ? formatAuthCallbackErrorMessage(callbackError)
      : null,
    preferLogin: Boolean(callbackError) || confirmed,
    // エラー時は待たない。code / email_confirmed があるときだけ短く待つ
    waiting: hasSignals && !callbackError,
  };
}

function HomeContent() {
  const [supabase] = useState(() => createClient());
  const searchParams = useSearchParams();
  const [callbackBoot] = useState(() =>
    readCallbackBoot(searchParams.toString())
  );
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [callbackWaitDone, setCallbackWaitDone] = useState(
    () => !callbackBoot.waiting
  );

  const authParam = searchParams.get("auth");
  const initialAuthMode =
    authParam === "login" || authParam === "start" ? authParam : null;
  // ロゴなどからトップ（LP）を明示表示。セッションがあっても棚へ飛ばさない。
  const preferLanding = searchParams.get("lp") === "1";

  useEffect(() => {
    return subscribeAuthUser(supabase, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, [supabase]);

  useEffect(() => {
    if (callbackWaitDone) return;
    if (user && !user.is_anonymous) {
      const timer = window.setTimeout(() => setCallbackWaitDone(true), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setCallbackWaitDone(true);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [callbackWaitDone, user]);

  const waitingOnEmailCallback = callbackBoot.waiting && !callbackWaitDone;

  if (!authReady || waitingOnEmailCallback) {
    return (
      <div className="lp-loading" aria-live="polite">
        {waitingOnEmailCallback
          ? "メール確認を処理しています..."
          : "読み込み中..."}
      </div>
    );
  }

  if (user && !preferLanding) {
    // アカウント切替時に棚・通知 state をリセット（別 user の完了通知を残さない）
    return <ShelfApp key={user.id} initialUser={user} />;
  }

  return (
    <LandingPage
      sessionUser={user}
      initialAuthMode={initialAuthMode}
      initialAuthMessage={callbackBoot.errorMessage}
      preferLogin={callbackBoot.preferLogin}
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="lp-loading" aria-live="polite">
          読み込み中...
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
