"use client";

import SvgShelfCompare from "./SvgShelfCompare";

export default function SvgShelfPreviewClient() {
  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">SVG骨格</h1>
          <p className="my-shelf-desc">
            開発環境だけの確認用です。自然遠近の空棚・作品配置実験に加え、参考画像Bの寸法再現（配置検証）を切り替えます。暫定決定版の独立保存は{" "}
            <a href="/dev/svg-shelf-b-decided">/dev/svg-shelf-b-decided</a>
            、画像背景試作は{" "}
            <a href="/dev/image-shelf-preview">/dev/image-shelf-preview</a>
            です。
          </p>
        </header>
        <SvgShelfCompare />
      </main>
    </div>
  );
}
