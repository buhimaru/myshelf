import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkDetail } from "@/components/work-detail";
import { createClient } from "@/lib/supabase/server";
import type { Work } from "@/lib/work";

type WorkPageProps = {
  params: Promise<{ id: string }>;
};

async function getWork(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("works")
    .select("id, title, category, image_url, description, created_at, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as Work | null;
}

export async function generateMetadata({
  params,
}: WorkPageProps): Promise<Metadata> {
  const { id } = await params;
  const work = await getWork(id);

  return {
    title: work?.title ?? "作品が見つかりません",
  };
}

export default async function WorkPage({ params }: WorkPageProps) {
  const { id } = await params;
  const work = await getWork(id);

  if (!work) {
    notFound();
  }

  return <WorkDetail work={work} />;
}
