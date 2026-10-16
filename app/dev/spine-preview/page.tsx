import { notFound } from "next/navigation";
import SpinePreview from "./SpinePreview";

export const metadata = {
  title: "背表紙プレビュー | myshelf",
  robots: { index: false, follow: false },
};

export default function SpinePreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <SpinePreview />;
}
