"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

const fieldClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Mode = "login" | "signup";

export function LoginForm() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function redirectHome() {
    router.push("/");
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsError(false);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const trimmedEmail = email.trim();

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });

        if (error) {
          setIsError(true);
          setMessage(formatAuthError(error));
          return;
        }

        const signedUpUser = data?.user ?? null;
        const session = data?.session ?? null;

        if (signedUpUser && (signedUpUser.identities?.length ?? 0) === 0) {
          setIsError(true);
          setMessage(
            "このメールアドレスは既に登録されています。ログインしてください。",
          );
          setMode("login");
          return;
        }

        if (session?.user?.id) {
          await redirectHome();
          return;
        }

        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });

        if (signInData?.session?.user?.id) {
          await redirectHome();
          return;
        }

        if (signInError) {
          const normalized = signInError.message.toLowerCase();
          if (normalized.includes("email not confirmed")) {
            setIsError(false);
            setMessage(
              "確認メールを送信しました。メール内のリンクを開くとログインできます。ホームから作品を閲覧することもできます。",
            );
            return;
          }
          setIsError(true);
          setMessage(formatAuthError(signInError));
          return;
        }

        setIsError(false);
        setMessage(
          "アカウントを作成しました。確認メールが届いている場合はリンクを開いてからログインしてください。",
        );
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setIsError(true);
        setMessage(formatAuthError(error));
        return;
      }

      if (!data?.session?.user?.id) {
        setIsError(true);
        setMessage(
          "ログイン情報を取得できませんでした。確認メールのリンクを開いてから再度お試しください。",
        );
        return;
      }

      await redirectHome();
    } catch (error) {
      console.error("[MyShelf] auth submit failed", error);
      setIsError(true);
      setMessage(formatAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoading && user?.id) {
    return (
      <Card className="w-full max-w-md bg-card/80">
        <CardHeader>
          <CardTitle>ログイン済みです</CardTitle>
          <CardDescription>
            {user.email ?? "アカウント"} でサインインしています。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => void redirectHome()}>
            ホームへ進む
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md bg-card/80">
      <CardHeader>
        <CardTitle>{mode === "login" ? "ログイン" : "アカウント作成"}</CardTitle>
        <CardDescription>
          メールアドレスとパスワードで MyShelf を利用できます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">メールアドレス</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClassName}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">パスワード</span>
            <input
              required
              type="password"
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClassName}
            />
          </label>

          {message ? (
            <p
              className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
              role={isError ? "alert" : "status"}
            >
              {message}
            </p>
          ) : null}

          <Button type="submit" disabled={isSubmitting} size="lg">
            {isSubmitting
              ? "送信中..."
              : mode === "login"
                ? "ログイン"
                : "登録する"}
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          {mode === "login" ? "アカウントをお持ちでない場合は" : "すでにアカウントがある場合は"}{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage(null);
              setIsError(false);
            }}
          >
            {mode === "login" ? "新規登録" : "ログイン"}
          </button>
        </p>

        <p className="mt-3 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            ホームに戻る
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
