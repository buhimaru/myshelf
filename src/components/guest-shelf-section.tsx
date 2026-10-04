"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { removeGuestWork, type GuestWork } from "@/lib/guest-shelf";
import { CATEGORY_LABELS } from "@/lib/work";

type GuestShelfSectionProps = {
  works: GuestWork[];
  onDeleted?: () => void | Promise<void>;
};

export function GuestShelfSection({
  works: initialWorks,
  onDeleted,
}: GuestShelfSectionProps) {
  const [works, setWorks] = useState<GuestWork[]>(initialWorks);

  async function handleRemove(title: string) {
    const updated = removeGuestWork(title);
    setWorks(updated);
    await onDeleted?.();
  }

  if (works.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          あなたの本棚
        </h2>
        <p className="text-sm text-muted-foreground">
          {works.length}件 ・ この端末の仮棚です。ログインするとクラウドに保存できます。
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {works.map((work, index) => {
          // 型定義に合わせて imageUrl のみを参照します
          const cover = work.imageUrl;

          return (
            <li key={`${work.title}-${index}`}>
              <Card className="flex h-full flex-row items-start gap-3 overflow-hidden bg-card/80 p-3">
                <img
                  src={cover || "https://placehold.co/100x150?text=No+Image"}
                  alt={work.title}
                  className="h-36 w-24 shrink-0 rounded-md object-cover bg-muted border"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "https://placehold.co/100x150?text=No+Image";
                  }}
                />
                <div className="flex min-w-0 flex-1 flex-col h-full">
                  <CardHeader className="p-0 pb-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {CATEGORY_LABELS[work.category]}
                    </p>
                    <CardTitle className="text-base">{work.title}</CardTitle>
                    <CardDescription className="line-clamp-3 text-xs mt-1">
                      {work.description || "あらすじはありません。"}
                    </CardDescription>
                  </CardHeader>
                  <div className="mt-auto pt-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => void handleRemove(work.title)}
                    >
                      棚から外す
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}