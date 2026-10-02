import { createClient } from "@/lib/supabase/client";

export const COVER_BUCKET = "covers";
const MAX_COVER_BYTES = 5 * 1024 * 1024;

export async function uploadWorkCover(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
  }

  if (file.size > MAX_COVER_BYTES) {
    throw new Error("画像は5MB以下にしてください。");
  }

  const fileExt = file.name.split(".").pop();
  if (!fileExt) {
    throw new Error("ファイル名に拡張子がありません。");
  }

  const filePath = `${Date.now()}_${Math.random()}.${fileExt}`;
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("画像をアップロードするにはログインしてください。");
  }

  const { data, error } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(filePath, file);

  if (error || !data) {
    console.error("[MyShelf] cover upload failed", error);
    throw new Error(error?.message ?? "画像のアップロードに失敗しました。");
  }

  const { data: publicUrlData } = supabase.storage
    .from(COVER_BUCKET)
    .getPublicUrl(data.path);

  if (!publicUrlData.publicUrl) {
    throw new Error("公開URLの取得に失敗しました。");
  }

  console.info("[MyShelf] cover upload succeeded", {
    path: data.path,
    publicUrl: publicUrlData.publicUrl,
  });

  return publicUrlData.publicUrl;
}
