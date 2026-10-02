import { ArrowLeft, BookOpen, Clapperboard, Library, Music } from "lucide-react";
import Link from "next/link";

import { WorkComments } from "@/components/work-comments";
import { WorkCover } from "@/components/work-cover";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  isWorkCategory,
  type Work,
  type WorkCategory,
} from "@/lib/work";

const categoryIcons: Record<WorkCategory, typeof Library> = {
  book: BookOpen,
  movie: Clapperboard,
  anime: Library,
  music: Music,
};

type WorkDetailProps = {
  work: Work;
};

export function WorkDetail({ work }: WorkDetailProps) {
  const category = isWorkCategory(work.category) ? work.category : "book";
  const Icon = categoryIcons[category];

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10">
      <div>
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "ghost" }), "gap-2 px-0")}
        >
          <ArrowLeft className="size-4" aria-hidden />
          一覧に戻る
        </Link>
      </div>

      <header className="space-y-5">
        <p className="inline-flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Icon className="size-3.5" aria-hidden />
            {CATEGORY_LABELS[category]}
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            {work.is_public === false ? "非公開" : "公開"}
          </span>
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {work.title}
        </h1>
      </header>

      {work.image_url ? (
        <div className="mx-auto flex w-full max-w-md items-center justify-center overflow-hidden rounded-3xl border border-border/70 bg-muted/40 p-4 shadow-sm">
          <div className="relative mx-auto h-[28rem] w-full max-h-[70vh] max-w-[18rem]">
            <WorkCover
              src={work.image_url}
              alt={`${work.title}の画像`}
              sizes="(max-width: 640px) 80vw, 20rem"
            />
          </div>
        </div>
      ) : (
        <div className="flex h-56 items-center justify-center rounded-3xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
          画像はまだ登録されていません
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">あらすじ</h2>
        {work.description ? (
          <p className="whitespace-pre-wrap text-base leading-8 text-foreground/90">
            {work.description}
          </p>
        ) : (
          <p className="text-muted-foreground">詳細はまだ登録されていません。</p>
        )}
      </section>

      <WorkComments workId={work.id} />
    </article>
  );
}
