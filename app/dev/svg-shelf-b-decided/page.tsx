import { notFound } from "next/navigation";
import DecidedShell from "./DecidedShell";

export const metadata = {
  title: "SVG暫定決定版（保存）| myshelf",
  robots: { index: false, follow: false },
};

/** 開発専用。暫定決定版SVGの独立保存ルート。 */
export default function SvgShelfBDecidedPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <DecidedShell />;
}
