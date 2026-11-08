"use client";

import dynamic from "next/dynamic";

const SvgShelfPreviewClient = dynamic(() => import("./SvgShelfPreviewClient"), {
  ssr: false,
  loading: () => (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <p className="my-shelf-desc">SVG骨格プレビューを読み込み中…</p>
      </main>
    </div>
  ),
});

export default function PreviewShell() {
  return <SvgShelfPreviewClient />;
}
