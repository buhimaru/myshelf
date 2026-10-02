"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type AccountPublicToggleProps = {
  initialPublic: boolean;
};

export function AccountPublicToggle({ initialPublic }: AccountPublicToggleProps) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setIsPublic(next);
    setIsSaving(true);
    setMessage(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setIsPublic(!next);
      setIsSaving(false);
      setMessage("ログインしてください。");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_public: next })
      .eq("id", user.id);

    setIsSaving(false);

    if (error) {
      setIsPublic(!next);
      setMessage(error.message || "公開設定の保存に失敗しました。");
      return;
    }

    setMessage(next ? "アカウントを公開しました。" : "アカウントを非公開にしました。");
  }

  return (
    <div className="grid gap-2">
      <label className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
        <input
          type="checkbox"
          name="account_is_public"
          checked={isPublic}
          disabled={isSaving}
          onChange={(event) => void handleChange(event.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="font-medium">アカウントを公開する</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            オフにすると、他の人の検索やゲスト画面にあなたの作品は出ません。
          </span>
        </span>
      </label>
      {message ? (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
