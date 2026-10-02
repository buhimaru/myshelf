import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkCard } from "@/components/work-card";
import { profileLabel } from "@/lib/profile";
import { selectPublicWorksByUser } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import type { Work } from "@/lib/work";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserShelfPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: UserShelfPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", id)
    .maybeSingle();

  const name = data ? profileLabel(data) : "";

  return {
    title: name ? `${name}の本棚` : "ユーザーの本棚",
  };
}

export default async function UserShelfPage({ params }: UserShelfPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, is_public")
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const user = (await getCurrentUser(supabase)) as { id: string } | null;
  const isOwner = user?.id === id;

  if (!isOwner && profile.is_public !== true) {
    notFound();
  }

  let works: Work[] = [];
  let error: { message: string } | null = null;

  if (isOwner) {
    const result = await supabase
      .from("works")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false });
    works = (result.data as Work[] | null) ?? [];
    error = result.error;
  } else {
    const result = await selectPublicWorksByUser(supabase, id);
    works = result.data;
    error = result.error;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {isOwner ? "あなたの本棚" : "公開本棚"}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {profileLabel(profile)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "アカウントの公開設定に関係なく、登録した作品をすべて表示しています。"
            : "公開アカウントの作品を表示しています。"}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-destructive">本棚の取得に失敗しました。</p>
      ) : works.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isOwner ? "まだ作品がありません。" : "公開作品はまだありません。"}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((work) => (
            <li key={work.id}>
              <WorkCard work={work} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
