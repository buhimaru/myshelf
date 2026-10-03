import Link from "next/link";

export function LoginPrompt({ message }: { message: string }) {
  return (
    <p
      className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      suppressHydrationWarning
    >
      {message}{" "}
      <Link
        href="/login"
        prefetch={false}
        className="font-medium text-foreground underline-offset-4 hover:underline"
        suppressHydrationWarning
      >
        ログイン
      </Link>
    </p>
  );
}
