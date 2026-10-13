"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import LandingPage from "../components/LandingPage";
import ShelfApp from "../components/ShelfApp";
import { subscribeAuthUser } from "../utils/supabase/authUser";
import { createClient } from "../utils/supabase/client";

function HomeContent() {
  const [supabase] = useState(() => createClient());
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const authParam = searchParams.get("auth");
  const initialAuthMode =
    authParam === "login" || authParam === "start" ? authParam : null;

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
    return <ShelfApp initialUser={user} />;
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
