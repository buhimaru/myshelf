import { WorksHome } from "@/components/works-home";
import { createClient } from "@/lib/supabase/server";
import type { Work } from "@/lib/work";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("works")
    .select("id, title, category, image_url, description, created_at, user_id")
    .order("created_at", { ascending: false });

  return (
    <WorksHome
      initialWorks={(data as Work[] | null) ?? []}
      initialError={error?.message ?? null}
    />
  );
}
