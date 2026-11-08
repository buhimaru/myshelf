"use client";

import { useState } from "react";
import type { MediaItem } from "../../../../types/media";
import CoverFitCompare, {
  type CoverFitBgOption,
} from "../CoverFitCompare";
import ShelfItemDetail from "../../../../components/ShelfItemDetail";
import { SHELF_TYPE_LABEL } from "../../../../utils/shelfDisplay";

/** 既存ファイルを参照するだけ。上書き・削除しない */
const BG_OPTIONS: readonly CoverFitBgOption[] = [
  {
    id: "v2",
    label: "旧試作 v2",
    src: "/images/shelf-left-led-v2-test.jpg?v=bg-cmp-v2",
    width: 1024,
    height: 664,
  },
  {
    id: "hd-v3",
    label: "新候補 HD v3",
    src: "/images/shelf-left-led-hd-v3-test.jpg?v=bg-cmp-hd-v3",
    width: 1024,
    height: 664,
  },
] as const;

export default function BgV2VsHdV3Client() {
  const [selected, setSelected] = useState<MediaItem | null>(null);

  return (
    <div className="my-shelf">
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">棚背景 v2 / HD v3 比較</h1>
          <p className="my-shelf-desc">
            ローカル限定プレビュー。作品の座標・サイズ・並びは現行どおり。背景画像だけを切り替えます。
          </p>
        </header>

        <CoverFitCompare
          onOpen={setSelected}
          bgOptions={BG_OPTIONS}
          initialBgId="hd-v3"
          largeStage
          leadText="旧試作 v2 と新候補 HD v3 を、同じ作品配置のまま背景だけ切り替えます。上段が背景、下段が表紙フィット A〜E。本番棚・採用画像には未適用です。"
        />
      </main>

      {selected ? (
        <ShelfItemDetail
          item={selected}
          genreLabel={SHELF_TYPE_LABEL[selected.type] ?? selected.type}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
