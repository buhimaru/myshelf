"use client";

import dynamic from "next/dynamic";

const ImageShelfPrototype = dynamic(() => import("./ImageShelfPrototype"), {
  ssr: false,
  loading: () => (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <p className="my-shelf-desc">画像背景棚を読み込み中…</p>
      </main>
    </div>
  ),
});

export default function ImageShelfShell() {
  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">画像背景棚（試作）</h1>
          <p className="my-shelf-desc">
            空の棚写真を背景に、完成イメージの配置・サイズ・間隔を再現する試作です。SVG版・本番棚は未変更。
          </p>
        </header>
        <ImageShelfPrototype />
      </main>
    </div>
  );
}
