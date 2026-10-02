"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AddWorkForm } from "@/components/AddWorkForm";
import { EditWorkDialog } from "@/components/edit-work-dialog";
import { LoginPrompt } from "@/components/login-prompt";
import { PublicSearchForm } from "@/components/public-search-form";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkCard } from "@/components/work-card";
import { createClient } from "@/lib/supabase/client";
import { selectOwnWorks, filterOwnWorks } from "@/lib/own-works";
import { cn } from "@/lib/utils";
import {
  CATEGORY_FILTERS,
  type FilterCategory,
  type Work,
} from "@/lib/work";

type WorksHomeProps = {
  initialWorks: Work[];
  initialPublicWorks: Work[];
  initialError: string | null;
};

export function WorksHome({
  initialWorks,
  initialPublicWorks,
  initialError,
}: WorksHomeProps) {
  const { user, isLoading } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [error, setError] = useState(initialError);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<FilterCategory>("all");
  const [editingWork, setEditingWork] = useState<Work | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setWorks([]);
      return;
    }

    setWorks(filterOwnWorks(initialWorks, user.id));
  }, [user?.id, initialWorks]);

  const filteredWorks = useMemo(() => {
    if (!user?.id) {
      return [];
    }

    const keyword = searchQuery.trim().toLowerCase();
    const ownWorks = filterOwnWorks(works, user.id);

    return ownWorks.filter((work) => {
      const matchesCategory =
        selectedCategory === "all" || work.category === selectedCategory;

      if (!matchesCategory) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const title = work.title.toLowerCase();
      const description = (work.description ?? "").toLowerCase();
      return title.includes(keyword) || description.includes(keyword);
    });
  }, [works, searchQuery, selectedCategory, user?.id]);

  const publicWorks = useMemo(
    () => initialPublicWorks.filter((work) => work.is_public !== false),
    [initialPublicWorks],
  );

  const hasActiveFilter =
    selectedCategory !== "all" || searchQuery.trim().length > 0;

  const countLabel = isRefreshing
    ? "最新の一覧を読み込んでいます..."
    : hasActiveFilter
      ? `${filteredWorks.length}件 / 全${works.length}件`
      : `${works.length}件`;

  async function refreshWorks() {
    setIsRefreshing(true);
    const supabase = createClient();
    const { user: currentUser, data, error: fetchError } =
      await selectOwnWorks(supabase);
    setIsRefreshing(false);

    if (!currentUser?.id) {
      setWorks([]);
      return;
    }

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setError(null);
    setWorks(filterOwnWorks(data, currentUser.id));
  }

  let worksContent = null;

  if (!error && filteredWorks.length === 0 && works.length === 0 && !hasActiveFilter) {
    worksContent = (
      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>まだ作品がありません</CardTitle>
          <CardDescription>
            左のフォームから最初の作品を登録すると、ここに表示されます。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  } else if (!error && filteredWorks.length === 0) {
    worksContent = (
      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>該当する作品が見つかりません</CardTitle>
          <CardDescription>
            キーワードやカテゴリを変えて、もう一度探してみてください。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  } else if (!error) {
    worksContent = (
      <ul className="grid gap-4 sm:grid-cols-2">
        {filteredWorks.map((work) => (
          <li key={work.id}>
            <WorkCard
              work={work}
              onEdit={setEditingWork}
              onDeleted={refreshWorks}
              showVisibility
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-10">
      <section className="space-y-4">
        <p className="w-fit rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
          エンタメ作品の管理・共有
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          大切な作品を、ひとつの棚に。
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          公開作品を探したり、ログインして自分の本棚を管理できます。
        </p>
        <PublicSearchForm />
      </section>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">ログイン状態を確認しています...</p>
      ) : user?.id ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <AddWorkForm onAdded={refreshWorks} />

          <section className="space-y-4">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight">
                あなたの本棚
              </h2>
              <p className="text-sm text-muted-foreground">{countLabel}</p>
            </div>

            <div className="space-y-3">
              <div
                className="flex flex-wrap gap-2"
                role="tablist"
                aria-label="カテゴリで絞り込み"
              >
                {CATEGORY_FILTERS.map((filter) => {
                  const isActive = selectedCategory === filter.value;
                  return (
                    <Button
                      key={filter.value}
                      type="button"
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      role="tab"
                      aria-selected={isActive}
                      className={cn("rounded-full px-3", !isActive && "bg-background")}
                      onClick={() => setSelectedCategory(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  );
                })}
              </div>

              <label className="relative block">
                <span className="sr-only">自分の作品を絞り込み</span>
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="自分の棚から検索"
                  className="h-10 w-full rounded-xl border border-input bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
            </div>

            {error ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                作品一覧の取得に失敗しました: {error}
              </p>
            ) : null}

            {worksContent}
          </section>
        </div>
      ) : (
        <section className="space-y-4">
          <LoginPrompt message="作品を登録して本棚を管理するにはログインしてください。" />
          <div>
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              公開されている作品
            </h2>
            <p className="text-sm text-muted-foreground">
              ログインなしで公開作品を閲覧できます。
            </p>
          </div>
          {publicWorks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              まだ公開作品がありません。
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicWorks.map((work) => (
                <li key={work.id}>
                  <WorkCard work={work} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <EditWorkDialog
        work={editingWork}
        onClose={() => setEditingWork(null)}
        onSaved={refreshWorks}
      />
    </div>
  );
}
