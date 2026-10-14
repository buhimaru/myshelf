"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import LandingPage from "../components/LandingPage";
import ShelfApp from "../components/ShelfApp";
import { subscribeAuthUser } from "../utils/supabase/authUser";
import { createClient } from "../utils/supabase/client";
import {
  markEmailConfirmReturn,
  stripEmailConfirmedParamFromUrl,
} from "../utils/supabase/registrationNotice";

function HomeContent() {
  const [supabase] = useState(() => createClient());
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const authParam = searchParams.get("auth");
  const initialAuthMode =
    authParam === "login" || authParam === "start" ? authParam : null;
  const emailConfirmedParam = searchParams.get("email_confirmed") === "1";

  // メール確認リンクからの戻り印のみ記録（完了判定は getUser の結果で行う）
  useEffect(() => {
    if (!emailConfirmedParam) return;
    markEmailConfirmReturn();
    stripEmailConfirmedParamFromUrl();
  }, [emailConfirmedParam]);

  useEffect(() => {
    return subscribeAuthUser(supabase, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, [supabase]);

  if (!authReady) {
    return (
      <div className="lp-loading" aria-live="polite">
        読み込み中...
      </div>
    );
  }

  if (user) {
    // アカウント切替時に棚・通知 state をリセット（別 user の完了通知を残さない）
    return <ShelfApp key={user.id} initialUser={user} />;
  }

  return <LandingPage initialAuthMode={initialAuthMode} />;
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
