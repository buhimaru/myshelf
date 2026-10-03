"use client";

import { useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { CoverUploadField } from "@/components/cover-upload-field";
import { LoginRequired } from "@/components/login-required";
import {
  MediaLookupButton,
  MediaLookupCandidates,
} from "@/components/media-lookup-controls";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MEDIA_LOOKUP_NOT_FOUND, type MediaLookupResult } from "@/lib/google-books";
import { createClient } from "@/lib/supabase/client";
import { fetchWorkMediaLookup } from "@/lib/work-media-lookup";
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
  const [mediaCandidates, setMediaCandidates] = useState<MediaLookupResult[]>(
    [],
  );

  function applyMediaLookup(item: MediaLookupResult) {
    if (item.description) {
      setDescription(item.description);
    }
    if (item.imageUrl) {
      setImageUrl(item.imageUrl);
    }
    setMediaCandidates([]);
    setIsError(false);
    setMessage(
      item.description || item.imageUrl
        ? `「${item.title}」の情報を入力しました。`
        : `「${item.title}」は見つかりましたが、あらすじと画像がありませんでした。`,
    );
  }

  async function handleMediaLookup() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setIsError(true);
      setMessage("タイトルを入力してから検索してください。");
      return;
    }

    setIsLookingUp(true);
    setMediaCandidates([]);
    setMessage(null);
    setIsError(false);

    try {
      const { items, error } = await fetchWorkMediaLookup(
        trimmedTitle,
        category,
      );

      if (items.length === 0) {
        setIsError(true);
        setMessage(error || MEDIA_LOOKUP_NOT_FOUND);
        return;
      }

      applyMediaLookup(items[0]);
      if (items.length > 1) {
        setMediaCandidates(items);
        setMessage(
          `先頭の「${items[0].title}」を入力しました。別の候補があれば下から選べます。`,
        );
      }
    } catch (error) {
      console.error("[MyShelf] media lookup failed", error);
      setIsError(true);
      setMessage(MEDIA_LOOKUP_NOT_FOUND);
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
      setMediaCandidates([]);
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
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">カテゴリ</span>
              <select
                required
                name="category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as WorkCategory);
                  setMediaCandidates([]);
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
                <MediaLookupButton
                  isLookingUp={isLookingUp}
                  onLookup={() => void handleMediaLookup()}
                />
              </div>
            </div>

            <MediaLookupCandidates
              items={mediaCandidates}
              onSelect={applyMediaLookup}
            />

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
