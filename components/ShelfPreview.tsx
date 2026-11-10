"use client";

import Image from "next/image";
import { useState } from "react";

type SampleFilter = "all" | "drama";

/** 両サンプルとも 3012×2385。枠サイズ固定のため同一アスペクト比を前提にする */
const SAMPLE_WIDTH = 3012;
const SAMPLE_HEIGHT = 2385;

const SAMPLES: Record<
  SampleFilter,
  { src: string; alt: string; label: string }
> = {
  all: {
    src: "/images/landing-sample-all.png",
    alt: "myshelfのサンプルプレビュー。全ジャンルの棚",
    label: "全ジャンル",
  },
  drama: {
    src: "/images/landing-sample-drama.png",
    alt: "myshelfのサンプルプレビュー。ドラマの棚",
    label: "ドラマ",
  },
};

export default function ShelfPreview() {
  const [filter, setFilter] = useState<SampleFilter>("all");
  const sample = SAMPLES[filter];

  return (
    <div className="lp-shelf-sample-inner">
      <p className="lp-shelf-sample-label" data-lp-label="sample-preview">
        サンプルプレビュー
      </p>

      <div
        id="lp-shelf-sample-panel"
        role="tabpanel"
        aria-labelledby={`lp-shelf-tab-${filter}`}
        className="lp-shelf-sample-frame"
      >
        <Image
          key={filter}
          src={sample.src}
          alt={sample.alt}
          width={SAMPLE_WIDTH}
          height={SAMPLE_HEIGHT}
          className="lp-shelf-sample-image"
          sizes="(max-width: 520px) 100vw, (max-width: 1099px) 94vw, 640px"
          quality={92}
          priority
          unoptimized
        />
      </div>

      <div className="lp-shelf-sample-controls">
        <div
          className="lp-shelf-sample-tabs"
          role="tablist"
          aria-label="サンプルプレビューの表示ジャンル"
        >
          {(Object.keys(SAMPLES) as SampleFilter[]).map((key) => {
            const selected = filter === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`lp-shelf-tab-${key}`}
                aria-selected={selected}
                aria-controls="lp-shelf-sample-panel"
                tabIndex={selected ? 0 : -1}
                className={`lp-shelf-sample-tab${selected ? " is-active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {SAMPLES[key].label}
              </button>
            );
          })}
        </div>
        <p className="lp-shelf-sample-hint">
          ジャンルを切り替えて棚を見てみよう。
        </p>
      </div>
    </div>
  );
}
