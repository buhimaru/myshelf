"use client";

import dynamic from "next/dynamic";

const SvgShelfBDecidedView = dynamic(
  () => import("../../../components/frozen/SvgShelfBDecidedView"),
  {
    ssr: false,
    loading: () => (
      <div className="my-shelf">
        <main className="my-shelf-main">
          <p className="my-shelf-desc">暫定決定版を読み込み中…</p>
        </main>
      </div>
    ),
  },
);

export default function DecidedShell() {
  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">SVG暫定決定版（保存）</h1>
          <p className="my-shelf-desc">
            変更前の暫定決定版を独立保存した開発用ページです。接合実験・画像素材実験の対象外です。
          </p>
        </header>
        <SvgShelfBDecidedView />
      </main>
    </div>
  );
}
