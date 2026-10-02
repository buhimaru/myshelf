import { createClient } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  created_at?: string;
};

export function profileLabel(profile: {
  username?: string | null;
  display_name?: string | null;
}) {
  return profile.username || profile.display_name || "ユーザー";
}

export async function ensureMyProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: user.email?.split("@")[0] || "ユーザー",
      display_name: user.email?.split("@")[0] || "ユーザー",
    },
    { onConflict: "id" },
  );

  if (error && !error.message?.toLowerCase().includes("duplicate")) {
    console.error("[MyShelf] profile insert failed", error);
  }
}
