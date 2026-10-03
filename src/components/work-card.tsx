"use client";

import { BookOpen, Clapperboard, Library, Music } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { WorkCover } from "@/components/work-cover";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isGuestWorkId, removeGuestWork } from "@/lib/guest-shelf";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_LABELS,
  formatSupabaseError,
  isWorkCategory,
  logSupabaseError,
  type Work,
  type WorkCategory,
} from "@/lib/work";

const categoryIcons: Record<WorkCategory, typeof Library> = {
  book: BookOpen,
  movie: Clapperboard,
  anime: Library,
  music: Music,
};

type WorkCardProps = {
  work: Work;
  onEdit?: (work: Work) => void;
  onDeleted?: () => void | Promise<void>;
  ownerName?: string | null;
  ownerId?: string | null;
};

export function WorkCard({
  work,
  onEdit,
  onDeleted,
  ownerName,
  ownerId,
}: WorkCardProps) {
  const { user } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const category = isWorkCategory(work.category) ? work.category : "book";
  const Icon = categoryIcons[category];
  const isGuestItem = isGuestWorkId(work.id);
  const canManage = Boolean(
    isGuestItem || (user?.id && work.user_id && work.user_id === user.id),
  );

  async function handleDelete() {
    if (!isGuestItem && !user?.id) {
      setMessage("削除するにはログインしてください。");
      return;
    }

    if (
      !window.confirm(
        `「${work.title}」を削除しますか？この操作は取り消せません。`,
      )
    ) {
      return;
    }

    setMessage(null);
    setIsDeleting(true);

    if (isGuestItem) {
      try {
        removeGuestWork(work.id);
        await onDeleted?.();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "仮棚からの削除に失敗しました。",
        );
      } finally {
        setIsDeleting(false);
      }
      return;
    }

    if (!user?.id) {
      setMessage("削除するにはログインしてください。");
      setIsDeleting(false);
      return;
    }

    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("works")
        .delete()
        .eq("id", work.id)
        .eq("user_id", user.id);

      if (error) {
        logSupabaseError("works.delete", { id: work.id }, {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setMessage(formatSupabaseError(error));
        return;
      }

      await onDeleted?.();
    } catch (error) {
      logSupabaseError("works.delete", { id: work.id }, error);
      setMessage(
        error instanceof Error
          ? error.message
          : "削除中に予期しないエラーが発生しました。",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const body = (
    <>
      {work.image_url ? (
        <div className="relative mx-auto h-48 w-full max-w-[12rem] bg-muted/40">
          <WorkCover
            src={work.image_url}
            alt=""
            sizes="12rem"
            className="transition-opacity hover:opacity-90"
          />
        </div>
      ) : null}
      <CardHeader>
        <div className="mb-1 flex items-center gap-2 text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="text-xs font-medium">{CATEGORY_LABELS[category]}</span>
        </div>
        <CardTitle className="transition-colors group-hover/card:text-primary">
          {work.title}
        </CardTitle>
        {ownerName && ownerId ? (
          <p className="text-xs text-muted-foreground">{ownerName}</p>
        ) : null}
        {work.description ? (
          <CardDescription className="line-clamp-3">
            {work.description}
          </CardDescription>
        ) : null}
      </CardHeader>
      {!work.description && !work.image_url ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            詳細はまだ登録されていません。
          </p>
        </CardContent>
      ) : null}
    </>
  );

  return (
    <Card className="h-full bg-card/80">
      {isGuestItem ? (
        <div>{body}</div>
      ) : (
        <Link href={`/works/${work.id}`} className="block outline-none">
          {body}
        </Link>
      )}
      <CardFooter className="mt-auto flex flex-col items-stretch gap-2">
        {message ? (
          <p className="text-xs text-destructive" role="alert">
            {message}
          </p>
        ) : null}
        {isGuestItem && onDeleted ? (
          <Button
            type="button"
            size="sm"
            className="w-full bg-red-500 text-white hover:bg-red-600"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? "削除中..." : "棚から外す"}
          </Button>
        ) : canManage && onEdit && onDeleted ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1 bg-slate-600 text-white hover:bg-blue-600"
              onClick={() => onEdit(work)}
            >
              編集
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
            >
              {isDeleting ? "削除中..." : "削除"}
            </Button>
          </div>
        ) : ownerId && ownerName ? (
          <Link
            href={`/users/${ownerId}`}
            className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
          >
            {ownerName}の本棚を見る
          </Link>
        ) : null}
      </CardFooter>
    </Card>
  );
}
