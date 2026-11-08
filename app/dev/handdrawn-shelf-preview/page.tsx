import { notFound } from "next/navigation";
import HanddrawnShelfPreview from "./HanddrawnShelfPreview";

export const metadata = {
  title: "手描き棚プレビュー | myshelf",
  robots: { index: false, follow: false },
};

export default function HanddrawnShelfPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <HanddrawnShelfPreview />;
}
