import { notFound } from "next/navigation";
import ImageShelfShell from "./ImageShelfShell";

export const metadata = {
  title: "画像背景棚試作 | myshelf",
  robots: { index: false, follow: false },
};

/** 開発専用。画像背景＋動的作品配置の試作。本番未適用。 */
export default function ImageShelfPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <ImageShelfShell />;
}
