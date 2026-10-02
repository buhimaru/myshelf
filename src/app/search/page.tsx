import type { Metadata } from "next";
import Link from "next/link";

import { PublicSearchForm } from "@/components/public-search-form";
import { WorkCard } from "@/components/work-card";
import { profileLabel } from "@/lib/profile";
import { searchPublicCatalog } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "検索",
};

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const supabase = await createClient();
  const { works, profiles, error } = await searchPublicCatalog(supabase, query);
  const ownerIds = [
    ...new Set(
      works
        .map((work) => work.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ownerIds);
    for (const owner of owners ?? []) {
      ownerNames.set(owner.id, profileLabel(owner));
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8">
      <section className="space-y-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          公開作品・ユーザーを探す
        </h1>
        <p className="text-muted-foreground">
          ユーザー名または作品名で検索できます。公開アカウントの作品だけが表示されます。
        </p>
        <PublicSearchForm initialQuery={query} />
      </section>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          検索に失敗しました: {error}
        </p>
      ) : null}

      {!query ? (
        <p className="text-sm text-muted-foreground">
          キーワードを入力して検索してください。
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              ユーザー
            </h2>
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                一致するユーザーはいません。
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <Link
                      href={`/users/${profile.id}`}
                      className="block rounded-2xl border border-border bg-card/80 px-4 py-3 hover:bg-muted/40"
                    >
                      <p className="font-medium">{profileLabel(profile)}</p>
                      <p className="text-xs text-muted-foreground">公開本棚を見る</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              公開作品
            </h2>
            {works.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                一致する公開作品はありません。
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {works.map((work) => (
                  <li key={work.id}>
                    <WorkCard
                      work={work}
                      ownerId={work.user_id}
                      ownerName={
                        work.user_id
                          ? ownerNames.get(work.user_id) ?? "ユーザー"
                          : null
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
