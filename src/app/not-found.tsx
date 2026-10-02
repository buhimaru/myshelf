import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        ページが見つかりません
      </h1>
      <p className="text-muted-foreground">
        指定された作品は存在しないか、削除された可能性があります。
      </p>
      <Link href="/" className={cn(buttonVariants())}>
        一覧に戻る
      </Link>
    </div>
  );
}
