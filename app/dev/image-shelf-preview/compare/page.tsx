import { notFound } from "next/navigation";
import CompareShell from "./CompareShell";

export const metadata = {
  title: "画像背景棚 比較 | myshelf",
  robots: { index: false, follow: false },
};

/** 開発専用。完成イメージと実装の並べ比較。 */
export default function ImageShelfComparePage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <CompareShell />;
}
