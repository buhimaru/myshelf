"use client";

import type { User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createClient } from "@/lib/supabase/client";
import { ensureMyProfile } from "@/lib/profile";
import {
  getCurrentUser,
  isAuthSessionMissingError,
} from "@/lib/supabase/session";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch (error) {
      console.error("[MyShelf] supabase client init failed", error);
      return null;
    }
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    void getCurrentUser(supabase)
      .then(async (nextUser) => {
        const resolved = (nextUser as User | null) ?? null;
        if (resolved?.id) {
          await ensureMyProfile();
        }
        if (!cancelled) {
          setUser(resolved);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (!isAuthSessionMissingError(error)) {
          console.error("[MyShelf] getCurrentUser failed", error);
        }
        setUser(null);
        setIsLoading(false);
      });

    const authListener = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) {
        return;
      }
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setIsLoading(false);
      if (nextUser?.id) {
        void ensureMyProfile();
      }
    });

    return () => {
      cancelled = true;
      authListener?.data?.subscription?.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    setUser(null);

    if (!supabase) {
      return;
    }

    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error && !isAuthSessionMissingError(error)) {
        console.error("[MyShelf] signOut failed", error);
      }
    } catch (error) {
      if (!isAuthSessionMissingError(error)) {
        console.error("[MyShelf] signOut failed", error);
      }
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth は AuthProvider の内側で使ってください。");
  }
  return context;
}
