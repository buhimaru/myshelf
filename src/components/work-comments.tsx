"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { LoginPrompt } from "@/components/login-prompt";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WorkComment } from "@/lib/comment";
import { createClient } from "@/lib/supabase/client";
import { formatSupabaseError, logSupabaseError } from "@/lib/work";

type WorkCommentsProps = {
  workId: string;
};

function formatCommentDate(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function WorkComments({ workId }: WorkCommentsProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const [comments, setComments] = useState<WorkComment[]>([]);
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function loadComments() {
    const { data, error } = await supabase
      .from("comments")
      .select("id, work_id, author_name, body, created_at, user_id")
      .eq("work_id", workId)
      .order("created_at", { ascending: false });

    if (error) {
      logSupabaseError("comments.select", { workId }, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      setIsError(true);
      setMessage(formatSupabaseError(error));
      setComments([]);
      return;
    }

    setIsError(false);
    setMessage(null);
    setComments((data as WorkComment[] | null) ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      await loadComments();
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [workId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setIsError(true);
      setMessage("コメントを入力してください。");
      return;
    }

    const userId = user?.id;
    if (!userId) {
      setIsError(true);
      setMessage("コメントするにはログインしてください。");
      return;
    }

    const payload = {
      work_id: workId,
      author_name: authorName.trim() || user?.email || null,
      body: trimmedBody,
      user_id: userId,
    };

    setIsSubmitting(true);
    setMessage(null);
    setIsError(false);

    const { error } = await supabase.from("comments").insert(payload);

    setIsSubmitting(false);

    if (error) {
      logSupabaseError("comments.insert", payload, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      setIsError(true);
      setMessage(formatSupabaseError(error));
      return;
    }

    setBody("");
    setAuthorName("");
    await loadComments();
  }

  async function handleDelete(comment: WorkComment) {
    if (!window.confirm("このコメントを削除しますか？")) {
      return;
    }

    setDeletingId(comment.id);
    const { error } = await supabase.from("comments").delete().eq("id", comment.id);
    setDeletingId(null);

    if (error) {
      logSupabaseError("comments.delete", { id: comment.id }, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      setIsError(true);
      setMessage(formatSupabaseError(error));
      return;
    }

    await loadComments();
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          この作品へのメモ・コメント
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          感想や思い出を残して、あとからゆっくり見返しましょう。
        </p>
      </div>

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>コメントを書く</CardTitle>
          <CardDescription>名前は任意です。未入力の場合は「匿名」と表示されます。</CardDescription>
        </CardHeader>
        <CardContent>
          {!user ? (
            <LoginPrompt message="コメントを投稿するにはログインが必要です。" />
          ) : (
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">名前（任意）</span>
                <input
                  name="author_name"
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  placeholder="あなたの名前"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">メモ・レビュー</span>
                <textarea
                  required
                  name="body"
                  rows={4}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="心に残った場面や、いまの気持ちを書いてみてください。"
                  className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              <div>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "投稿中..." : "投稿する"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">コメントを読み込んでいます...</p>
      ) : isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
          コメントを表示できません。Supabase に comments テーブルがあるか確認してください。
        </p>
      ) : comments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          まだコメントはありません。最初の一言を残してみましょう。
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id}>
              <article className="rounded-2xl border border-border/80 bg-card/70 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {comment.author_name?.trim() || "匿名"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCommentDate(comment.created_at)}
                    </p>
                  </div>
                  {user?.id && comment.user_id === user.id ? (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-red-500 text-white hover:bg-red-600"
                      disabled={deletingId === comment.id}
                      onClick={() => handleDelete(comment)}
                    >
                      {deletingId === comment.id ? "削除中..." : "削除"}
                    </Button>
                  ) : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">
                  {comment.body}
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
