"use client";

import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { WorkCover } from "@/components/work-cover";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MEDIA_LOOKUP_NOT_FOUND,
  type MediaLookupResult,
} from "@/lib/google-books";
import {
  addGuestWork,
  guestShelfHasTitle,
} from "@/lib/guest-shelf";
import { createClient } from "@/lib/supabase/client";
import {
  buildWorkWritePayload,
  CATEGORY_LABELS,
  formatSupabaseError,
  logSupabaseError,
  WORK_CATEGORIES,
  type WorkCategory,
} from "@/lib/work";
import { fetchWorkMediaLookup } from "@/lib/work-media-lookup";

const fieldClassName =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type CatalogSearchSectionProps = {
  onAdded?: () => void | Promise<void>;
};

export function CatalogSearchSection({ onAdded }: CatalogSearchSectionProps) {
  const { user, isLoading } = useAuth();
  const [category, setCategory] = useState<WorkCategory>("book");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaLookupResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) {
      setIsError(true);
      setMessage("キーワードを入力してください。");
      return;
    }

    setIsSearching(true);
    setMessage(null);
    setIsError(false);
    setItems([]);

    try {
      const result = await fetchWorkMediaLookup(keyword, category);
      if (result.items.length === 0) {
        setIsError(true);
        setMessage(result.error || MEDIA_LOOKUP_NOT_FOUND);
        return;
      }
      setItems(result.items);
    } catch (error) {
      console.error("[MyShelf] catalog search failed", error);
      setIsError(true);
      setMessage(MEDIA_LOOKUP_NOT_FOUND);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleAdd(item: MediaLookupResult) {
    if (isLoading) {
      return;
    }

    setAddingId(item.id);
    setMessage(null);
    setIsError(false);

    const description = [item.authors, item.description]
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n\n");

    try {
      if (user?.id) {
        const supabase = createClient();
        const payload = buildWorkWritePayload({
          title: item.title,
          category,
          imageUrl: item.imageUrl,
          description,
          userId: user.id,
        });
        const { error } = await supabase.from("works").insert(payload);
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
        setAddedIds((current) =>
          current.includes(item.id) ? current : [...current, item.id],
        );
        setMessage(`「${item.title}」を本棚に追加しました。`);
        await onAdded?.();
        return;
      }

      if (guestShelfHasTitle(item.title, category)) {
        setMessage(`「${item.title}」はすでに仮棚にあります。`);
        return;
      }

      addGuestWork({
        title: item.title,
        category,
        imageUrl: item.imageUrl,
        description,
      });
      setAddedIds((current) =>
        current.includes(item.id) ? current : [...current, item.id],
      );
      setMessage(`「${item.title}」を仮の本棚に追加しました。`);
      await onAdded?.();
    } catch (error) {
      console.error("[MyShelf] catalog add failed", error);
      setIsError(true);
      setMessage("作品の追加に失敗しました。");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          作品を検索して棚に追加
        </h2>
        <p className="text-sm text-muted-foreground">
          ログインしなくても、キーワードで作品を探してこの端末の仮棚に追加できます。ログイン中は自分の本棚へ保存します。
        </p>
      </div>

      <form
        className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"
        onSubmit={handleSearch}
      >
        <label className="grid gap-1">
          <span className="sr-only">カテゴリ</span>
          <select
            name="category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as WorkCategory);
              setItems([]);
              setAddedIds([]);
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
        <label className="relative block min-w-0">
          <span className="sr-only">作品キーワード</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="catalog_q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="タイトル・作品名で外部検索"
            className="h-10 w-full rounded-xl border border-input bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <Button type="submit" disabled={isSearching} className="shrink-0">
          {isSearching ? "検索中..." : "検索"}
        </Button>
      </form>

      {message ? (
        <p
          className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isAdded = addedIds.includes(item.id);
            return (
              <li key={item.id}>
                <Card className="h-full bg-card/80">
                  {item.imageUrl ? (
                    <div className="relative mx-auto h-48 w-full max-w-[12rem] bg-muted/40">
                      <WorkCover src={item.imageUrl} alt="" sizes="12rem" />
                    </div>
                  ) : null}
                  <CardHeader>
                    <p className="text-xs font-medium text-muted-foreground">
                      {CATEGORY_LABELS[category]}
                    </p>
                    <CardTitle>{item.title}</CardTitle>
                    {item.authors ? (
                      <p className="text-xs text-muted-foreground">{item.authors}</p>
                    ) : null}
                    {item.description ? (
                      <CardDescription className="line-clamp-4">
                        {item.description}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardFooter className="mt-auto">
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={isAdded || addingId === item.id || isLoading}
                      onClick={() => void handleAdd(item)}
                    >
                      {isAdded
                        ? "追加済み"
                        : addingId === item.id
                          ? "追加中..."
                          : "自分の棚に追加"}
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
