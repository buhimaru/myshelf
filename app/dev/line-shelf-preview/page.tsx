import { notFound } from "next/navigation";
import LineShelfPreview from "./LineShelfPreview";

export const metadata = {
  title: "線画棚プレビュー | myshelf",
  robots: { index: false, follow: false },
};

export default function LineShelfPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <LineShelfPreview />;
}
