"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type PublicSearchFormProps = {
  initialQuery?: string;
};

export function PublicSearchForm({ initialQuery = "" }: PublicSearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    const href = nextQuery
      ? `/search?q=${encodeURIComponent(nextQuery)}`
      : "/search";
    router.push(href);
  }

  return (
    <form className="flex w-full flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
      <label className="relative block min-w-0 flex-1">
        <span className="sr-only">ユーザー名または作品名で検索</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ユーザー名または作品名で検索"
          className="h-10 w-full rounded-xl border border-input bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <Button type="submit" className="shrink-0">
        検索
      </Button>
    </form>
  );
}
