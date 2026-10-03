"use client";

import { useEffect, useState, type FormEvent } from "react";

import { CoverUploadField } from "@/components/cover-upload-field";
import {
  MediaLookupButton,
  MediaLookupCandidates,
} from "@/components/media-lookup-controls";
import { Button } from "@/components/ui/button";
import { MEDIA_LOOKUP_NOT_FOUND, type MediaLookupResult } from "@/lib/google-books";
import { createClient } from "@/lib/supabase/client";
import { fetchWorkMediaLookup } from "@/lib/work-media-lookup";
import {
  CATEGORY_LABELS,
  WORK_CATEGORIES,
  formatSupabaseError,
  isWorkCategory,
  logSupabaseError,
  type Work,
  type WorkCategory,
} from "@/lib/work";

const fieldClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type EditWorkDialogProps = {
  work: Work | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export function EditWorkDialog({ work, onClose, onSaved }: EditWorkDialogProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<WorkCategory>("book");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isLookupError, setIsLookupError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mediaCandidates, setMediaCandidates] = useState<MediaLookupResult[]>(
    [],
  );

  useEffect(() => {
    if (!work) {
      return;
    }

    setTitle(work.title);
    setCategory(isWorkCategory(work.category) ? work.category : "book");
    setImageUrl(work.image_url ?? "");
    setDescription(work.description ?? "");
    setMessage(null);
    setIsLookupError(false);
    setIsSaving(false);
    setMediaCandidates([]);
  }, [work]);

  if (!work) {
    return null;
  }

  const workId = work.id;

  function applyMediaLookup(item: MediaLookupResult) {
    if (item.description) {
      setDescription(item.description);
    }
    if (item.imageUrl) {
      setImageUrl(item.imageUrl);
    }
    setMediaCandidates([]);
    setIsLookupError(false);
    setMessage(
      item.description || item.imageUrl
        ? `「${item.title}」の情報を入力しました。`
        : `「${item.title}」は見つかりましたが、あらすじと画像がありませんでした。`,
    );
  }

  async function handleMediaLookup() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setIsLookupError(true);
      setMessage("タイトルを入力してから検索してください。");
      return;
    }

    setIsLookingUp(true);
    setMediaCandidates([]);
    setMessage(null);
    setIsLookupError(false);

    try {
      const { items, error } = await fetchWorkMediaLookup(
        trimmedTitle,
        category,
      );

      if (items.length === 0) {
        setIsLookupError(true);
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
      setIsLookupError(true);
      setMessage(MEDIA_LOOKUP_NOT_FOUND);
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsLookupError(false);

    if (isUploadingCover) {
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setMessage("タイトルを入力してください。");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setMessage("編集するにはログインしてください。");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        title: trimmedTitle,
        category,
        image_url: imageUrl.trim() || null,
        description: description.trim() || null,
      };

      console.info("[MyShelf] works.update payload", { id: workId, ...payload });

      const { error } = await supabase
        .from("works")
        .update(payload)
        .eq("id", workId)
        .eq("user_id", user.id);

      if (error) {
        logSupabaseError("works.update", { id: workId, ...payload }, {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setMessage(formatSupabaseError(error));
        return;
      }

      await onSaved();
      onClose();
    } catch (error) {
      logSupabaseError("works.update", { id: workId, category }, error);
      setMessage(
        error instanceof Error
          ? error.message
          : "更新中に予期しないエラーが発生しました。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-work-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="edit-work-title"
          className="font-heading text-lg font-semibold tracking-tight"
        >
          作品を編集
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          タイトル・カテゴリ・画像URL・詳細を更新できます。
        </p>

        <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
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
                className={fieldClassName}
              />
              <MediaLookupButton
                isLookingUp={isLookingUp}
                disabled={isSaving || isUploadingCover}
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
            disabled={isSaving}
            onUploadingChange={setIsUploadingCover}
          />

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">詳細 / あらすじ</span>
            <textarea
              name="description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>

          {message ? (
            <p
              className={
                isLookupError
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
              role={isLookupError ? "alert" : "status"}
            >
              {message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving || isUploadingCover}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={isSaving || isUploadingCover}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isUploadingCover
                ? "アップロード中..."
                : isSaving
                  ? "保存中..."
                  : "保存"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
