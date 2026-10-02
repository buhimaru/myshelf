import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkDetail } from "@/components/work-detail";
import { createClient } from "@/lib/supabase/server";
import type { Work } from "@/lib/work";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkPageProps = {
  params: Promise<{ id: string }>;
};

async function getVisibleWork(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("works")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return { user, work: null as Work | null };
  }

  const work = data as Work;
  const isOwner = Boolean(user?.id && work.user_id === user.id);
  if (!isOwner && work.is_public === false) {
    return { user, work: null };
  }

  return { user, work };
}

export async function generateMetadata({
  params,
}: WorkPageProps): Promise<Metadata> {
  const { id } = await params;
  const { work } = await getVisibleWork(id);

  return {
    title: work?.title ?? "作品が見つかりません",
  };
}

export default async function WorkPage({ params }: WorkPageProps) {
  const { id } = await params;
  const { work } = await getVisibleWork(id);

  if (!work) {
    notFound();
  }

  return <WorkDetail work={work} />;
}
