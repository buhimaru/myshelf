"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import LandingPage from "../components/LandingPage";
import ShelfApp from "../components/ShelfApp";
import { createClient } from "../utils/supabase/client";

function HomeContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<unknown>(null);
  const [authReady, setAuthReady] = useState(false);

  const authParam = searchParams.get("auth");
  const initialAuthMode =
    authParam === "login" || authParam === "start" ? authParam : null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <div className="lp-loading" aria-live="polite">
        読み込み中...
      </div>
    );
  }

  if (user) {
    return <ShelfApp />;
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
