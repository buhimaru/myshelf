"use client";

import { useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { CoverUploadField } from "@/components/cover-upload-field";
import { LoginRequired } from "@/components/login-required";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BookLookupResult } from "@/lib/google-books";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_LABELS,
  WORK_CATEGORIES,
  buildWorkWritePayload,
  formatSupabaseError,
  logSupabaseError,
  type WorkCategory,
} from "@/lib/work";

const fieldClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type AddWorkFormProps = {
  onAdded?: () => void | Promise<void>;
};

export function AddWorkForm({ onAdded }: AddWorkFormProps) {
  const { user, isLoading } = useAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<WorkCategory>("book");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [bookCandidates, setBookCandidates] = useState<BookLookupResult[]>([]);

  function applyBookLookup(book: BookLookupResult) {
    if (book.description) {
      setDescription(book.description);
    }
    if (book.imageUrl) {
      setImageUrl(book.imageUrl);
    }
    setBookCandidates([]);
    setIsError(false);
    setMessage(
      book.description || book.imageUrl
        ? `「${book.title}」の情報を入力しました。`
        : `「${book.title}」は見つかりましたが、あらすじと画像がありませんでした。`,
    );
  }

  async function handleBookLookup() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setIsError(true);
      setMessage("タイトルを入力してから検索してください。");
      return;
    }

    setIsLookingUp(true);
    setBookCandidates([]);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch(
        `/api/books/search?title=${encodeURIComponent(trimmedTitle)}`,
      );
      const payload = (await response.json()) as {
        items?: BookLookupResult[];
        error?: string;
      };
      const items = payload.items ?? [];
      console.log("[MyShelf] book lookup response", {
        ok: response.ok,
        status: response.status,
        count: items.length,
        error: payload.error,
      });

      if (!response.ok) {
        setIsError(true);
        setMessage(payload.error ?? "書籍情報の取得に失敗しました。");
        return;
      }

      if (items.length === 0) {
        setIsError(true);
        setMessage("該当する本が見つかりませんでした");
        return;
      }

      if (items.length === 1) {
        applyBookLookup(items[0]);
        return;
      }

      applyBookLookup(items[0]);
      setBookCandidates(items);
      setMessage(
        `先頭の「${items[0].title}」を入力しました。別の候補があれば下から選べます。`,
      );
    } catch (error) {
      console.error("[MyShelf] book lookup failed", error);
      setIsError(true);
      setMessage("書籍情報の取得中にエラーが発生しました。");
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsError(false);

    if (isUploadingCover) {
      return;
    }

    const userId = user?.id;
    if (!userId) {
      setIsError(true);
      setMessage("作品を登録するにはログインしてください。");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setIsError(true);
      setMessage("タイトルを入力してください。");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const payload = buildWorkWritePayload({
        title: trimmedTitle,
        category,
        imageUrl,
        description,
        userId,
      });

      const { data, error } = await supabase
        .from("works")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        logSupabaseError("works.insert", payload, {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setIsError(true);
        setMessage(formatSupabaseError(error));
        return;
      }

      console.info("[MyShelf] works.insert succeeded", data);

      setTitle("");
      setCategory("book");
      setImageUrl("");
      setDescription("");
      setBookCandidates([]);
      setIsError(false);
      setMessage("作品を登録しました。");
      await onAdded?.();
    } catch (error) {
      logSupabaseError("works.insert", { title: trimmedTitle, category }, error);
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "登録中に予期しないエラーが発生しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="bg-card/80">
      <CardHeader>
        <CardTitle>作品を追加</CardTitle>
        <CardDescription>
          本・映画・アニメ・音楽を棚に登録します。タイトルとカテゴリは必須です。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">ログイン状態を確認しています...</p>
        ) : !user ? (
          <LoginRequired />
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">タイトル</span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  required
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="作品名"
                  className={fieldClassName}
                />
                {category === "book" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLookingUp}
                    className="shrink-0"
                    onClick={() => void handleBookLookup()}
                  >
                    {isLookingUp ? "検索中..." : "あらすじ・画像を取得"}
                  </Button>
                ) : null}
              </div>
            </div>

            {category === "book" && bookCandidates.length > 1 ? (
              <ul className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3">
                {bookCandidates.map((book) => (
                  <li key={book.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-background"
                      onClick={() => applyBookLookup(book)}
                    >
                      <span className="font-medium">{book.title}</span>
                      {book.authors ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {book.authors}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <label className="grid gap-1.5">
              <span className="text-sm font-medium">カテゴリ</span>
              <select
                required
                name="category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as WorkCategory);
                  setBookCandidates([]);
                }}
                className={fieldClassName}
              >
                {WORK_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <CoverUploadField
              imageUrl={imageUrl}
              onImageUrlChange={setImageUrl}
              disabled={isSubmitting || !user}
              onUploadingChange={setIsUploadingCover}
            />

            <label className="grid gap-1.5">
              <span className="text-sm font-medium">
                詳細 / あらすじ
                <span className="ml-1 font-normal text-muted-foreground">
                  （任意）
                </span>
              </span>
              <textarea
                name="description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="感想やあらすじを入力"
                className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            {message ? (
              <p
                className={
                  isError
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
                role={isError ? "alert" : "status"}
              >
                {message}
              </p>
            ) : null}

            <div>
              <Button
                type="submit"
                disabled={isSubmitting || isUploadingCover || !user}
                size="lg"
              >
                {isUploadingCover
                  ? "アップロード中..."
                  : isSubmitting
                    ? "登録中..."
                    : "登録する"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
