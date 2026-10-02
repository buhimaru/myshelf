import { WorksHome } from "@/components/works-home";
import { filterOwnWorks } from "@/lib/own-works";
import { selectPublicWorks } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import type { Work } from "@/lib/work";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const supabase = await createClient();
  const user = (await getCurrentUser(supabase)) as { id: string } | null;

  const { data: publicWorks, error: publicError } =
    await selectPublicWorks(supabase);

  let ownWorks: Work[] = [];
  let ownError: string | null = null;
  let accountPublic = true;

  if (user?.id) {
    const [{ data, error }, profileResult] = await Promise.all([
      supabase
        .from("works")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("is_public")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    ownWorks = filterOwnWorks((data as Work[] | null) ?? [], user.id);
    ownError = error?.message ?? null;
    accountPublic = profileResult.data?.is_public !== false;
  }

  return (
    <WorksHome
      initialWorks={ownWorks}
      initialPublicWorks={publicWorks}
      initialAccountPublic={accountPublic}
      initialError={ownError ?? publicError?.message ?? null}
    />
  );
}
