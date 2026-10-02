import { WorksHome } from "@/components/works-home";
import { filterOwnWorks } from "@/lib/own-works";
import { selectPublicWorks } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import type { Work } from "@/lib/work";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: publicWorks, error: publicError } =
    await selectPublicWorks(supabase);

  let ownWorks: Work[] = [];
  let ownError: string | null = null;

  if (user?.id) {
    const { data, error } = await supabase
      .from("works")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    ownWorks = filterOwnWorks((data as Work[] | null) ?? [], user.id);
    ownError = error?.message ?? null;
  }

  return (
    <WorksHome
      initialWorks={ownWorks}
      initialPublicWorks={publicWorks}
      initialError={ownError ?? publicError?.message ?? null}
    />
  );
}
