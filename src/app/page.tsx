import { LoginRequired } from "@/components/login-required";
import { WorksHome } from "@/components/works-home";
import { filterOwnWorks } from "@/lib/own-works";
import { createClient } from "@/lib/supabase/server";
import type { Work } from "@/lib/work";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return <LoginRequired />;
  }

  const { data, error } = await supabase
    .from("works")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <WorksHome
      initialWorks={filterOwnWorks((data as Work[] | null) ?? [], user.id)}
      initialError={error?.message ?? null}
    />
  );
}
