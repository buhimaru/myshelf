import { notFound } from "next/navigation";
import CoverShelfPreview from "./CoverShelfPreview";

export const metadata = {
  title: "表紙棚プレビュー | myshelf",
  robots: { index: false, follow: false },
};

export default function CoverShelfPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <CoverShelfPreview />;
}
