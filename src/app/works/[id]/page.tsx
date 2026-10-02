import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LoginRequired } from "@/components/login-required";
import { WorkDetail } from "@/components/work-detail";
import { createClient } from "@/lib/supabase/server";
import type { Work } from "@/lib/work";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkPageProps = {
  params: Promise<{ id: string }>;
};

async function getOwnWork(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { user: null, work: null };
  }

  const { data, error } = await supabase
    .from("works")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { user, work: null };
  }

  if (!data || data.user_id !== user.id) {
    return { user, work: null };
  }

  return { user, work: data as Work };
}

export async function generateMetadata({
  params,
}: WorkPageProps): Promise<Metadata> {
  const { id } = await params;
  const { user, work } = await getOwnWork(id);

  if (!user) {
    return { title: "ログインが必要です" };
  }

  return {
    title: work?.title ?? "作品が見つかりません",
  };
}

export default async function WorkPage({ params }: WorkPageProps) {
  const { id } = await params;
  const { user, work } = await getOwnWork(id);

  if (!user) {
    return <LoginRequired />;
  }

  if (!work) {
    notFound();
  }

  return <WorkDetail work={work} />;
}
