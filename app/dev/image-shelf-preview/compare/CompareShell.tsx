"use client";

import dynamic from "next/dynamic";

const CompareClient = dynamic(() => import("./CompareClient"), {
  ssr: false,
  loading: () => (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <p className="my-shelf-desc">比較画面を読み込み中…</p>
      </main>
    </div>
  ),
});

export default function CompareShell() {
  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">完成イメージとの比較</h1>
          <p className="my-shelf-desc">
            左が完成イメージ、右が空棚＋動的配置の実装です。下表で各作品の座標・サイズ差分を確認できます。
          </p>
        </header>
        <CompareClient />
      </main>
    </div>
  );
}
