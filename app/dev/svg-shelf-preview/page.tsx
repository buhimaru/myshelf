import { notFound } from "next/navigation";
import PreviewShell from "./PreviewShell";

export const metadata = {
  title: "SVG骨格 | myshelf",
  robots: { index: false, follow: false },
};

/**
 * 開発用プレビュー本体は Client 側で ssr:false 読み込み。
 * data-cursor-ref 注入などによるハイドレーション不一致を避ける。
 */
export default function SvgShelfPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <PreviewShell />;
}
