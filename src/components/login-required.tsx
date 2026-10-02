import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoginRequiredProps = {
  message?: string;
};

export function LoginRequired({
  message = "作品を棚に追加・閲覧するにはログインが必要です。",
}: LoginRequiredProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 py-10">
      <p className="text-base leading-7 text-muted-foreground">{message}</p>
      <Link href="/login" className={cn(buttonVariants(), "inline-flex")}>
        ログインする
      </Link>
    </div>
  );
}
