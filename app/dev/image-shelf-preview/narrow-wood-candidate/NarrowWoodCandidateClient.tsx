"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaItem } from "../../../../types/media";
import ImageShelf, {
  type ImageShelfRenderSpec,
} from "../../../../components/ImageShelf";
import ShelfItemDetail from "../../../../components/ShelfItemDetail";
import { createClient } from "../../../../utils/supabase/client";
import { SHELF_TYPE_LABEL } from "../../../../utils/shelfDisplay";
import {
  IMAGE_SHELF_BG,
  isNearImageShelfLed,
  layoutImageShelfPages,
  toImageShelfPercent,
} from "../../../../utils/imageShelfLayout";
import {
  CANDIDATE_NARROW_SHELF_BG,
  isNearCandidateNarrowShelfLed,
  layoutCandidateNarrowShelfPages,
  toCandidateNarrowShelfPercent,
} from "../../../../utils/imageShelfLayoutCandidateNarrow";
import {
  CANDIDATE_WARM_SHELF_BG,
  CANDIDATE_WARM_SHELF_LAYOUT,
  CANDIDATE_WARM_SHELF_LAYOUT_BEFORE,
  CANDIDATE_WARM_SHELF_LAYOUT_D,
  isNearCandidateWarmShelfLed,
  layoutCandidateWarmShelfPages,
  layoutCandidateWarmShelfPagesBefore,
  layoutCandidateWarmShelfPagesD,
  toCandidateWarmShelfPercent,
} from "../../../../utils/imageShelfLayoutCandidateWarm";
import { COVER_SHELF_RICH_ITEMS } from "../../cover-shelf-preview/items";
import styles from "./narrowWoodCandidate.module.css";

type Variant = "A" | "B" | "C" | "C0" | "D";

const SPEC_A: ImageShelfRenderSpec = {
  bg: IMAGE_SHELF_BG,
  layoutPages: layoutImageShelfPages,
  toPercent: toImageShelfPercent,
  isNearLed: isNearImageShelfLed,
};

const SPEC_B: ImageShelfRenderSpec = {
  bg: CANDIDATE_NARROW_SHELF_BG,
  layoutPages: layoutCandidateNarrowShelfPages,
  toPercent: toCandidateNarrowShelfPercent,
  isNearLed: isNearCandidateNarrowShelfLed,
};

const SPEC_C: ImageShelfRenderSpec = {
  bg: CANDIDATE_WARM_SHELF_BG,
  layoutPages: layoutCandidateWarmShelfPages,
  toPercent: toCandidateWarmShelfPercent,
  isNearLed: isNearCandidateWarmShelfLed,
};

const SPEC_C0: ImageShelfRenderSpec = {
  bg: CANDIDATE_WARM_SHELF_BG,
  layoutPages: layoutCandidateWarmShelfPagesBefore,
  toPercent: toCandidateWarmShelfPercent,
  isNearLed: isNearCandidateWarmShelfLed,
};

const SPEC_D: ImageShelfRenderSpec = {
  bg: CANDIDATE_WARM_SHELF_BG,
  layoutPages: layoutCandidateWarmShelfPagesD,
  toPercent: toCandidateWarmShelfPercent,
  isNearLed: isNearCandidateWarmShelfLed,
};

const SPECS: Record<Variant, ImageShelfRenderSpec> = {
  A: SPEC_A,
  B: SPEC_B,
  C: SPEC_C,
  C0: SPEC_C0,
  D: SPEC_D,
};

function mapRow(row: {
  id: string | number;
  title: string;
  category: string;
  creator: string | null;
  image_url: string | null;
  description: string | null;
  created_at: string;
}): MediaItem {
  return {
    id: String(row.id),
    title: row.title,
    creator: row.creator,
    type: row.category as MediaItem["type"],
    imageUrl: row.image_url ?? undefined,
    description: row.description,
    createdAt: row.created_at,
  };
}

function captionFor(variant: Variant): string {
  if (variant === "A") {
    return `A：${IMAGE_SHELF_BG.src.split("?")[0]}（配置は現行 IMAGE_SHELF_ROWS）`;
  }
  if (variant === "B") {
    return `B：${CANDIDATE_NARROW_SHELF_BG.src.split("?")[0]}（候補B ROWS・1024×704）`;
  }
  if (variant === "C0") {
    const L = CANDIDATE_WARM_SHELF_LAYOUT_BEFORE;
    return `C前：scale ${L.coverScale} / GAP ${L.gap} / bottomY ${L.rows.map((r) => r.bottomY).join("·")}`;
  }
  if (variant === "D") {
    const L = CANDIDATE_WARM_SHELF_LAYOUT_D;
    const extra = L.bayExtraScale.join("·");
    return `D：Cベース / bayExtra ${extra} / bottomY ${L.rows.map((r) => r.bottomY).join("·")}（3段 +4）`;
  }
  const L = CANDIDATE_WARM_SHELF_LAYOUT;
  return `C：scale ${L.coverScale} / GAP ${L.gap} / bottomY ${L.rows.map((r) => r.bottomY).join("·")}（3·4段 −7）`;
}

export default function NarrowWoodCandidateClient() {
  const [variant, setVariant] = useState<Variant>("C");
  const [items, setItems] = useState<MediaItem[]>(() =>
    COVER_SHELF_RICH_ITEMS.filter((item) => Boolean(item.imageUrl)).slice(0, 25)
  );
  const [sourceLabel, setSourceLabel] = useState("サンプル作品");
  const [selected, setSelected] = useState<MediaItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data, error } = await supabase
        .from("items")
        .select("id, title, category, creator, image_url, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (cancelled || error || !data || data.length === 0) return;

      setItems(data.map(mapRow));
      setSourceLabel(`自分の棚（${data.length}件）`);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const renderSpec = useMemo(() => SPECS[variant], [variant]);

  return (
    <div className={`my-shelf ${styles.root}`}>
      <main className="my-shelf-main">
        <header className="my-shelf-intro">
          <h1 className="my-shelf-heading">棚背景候補 A / B / C / D 比較</h1>
          <p className="my-shelf-desc">
            ローカル限定。A は暫定採用、B は高画質候補、C
            は温もり（微調整）、D は C の追加調整です。「C前」で調整前も比較できます。正式採用はしていません。
          </p>
          <p className={styles.meta}>表示データ: {sourceLabel}</p>
        </header>

        <div className={styles.switcher} role="group" aria-label="背景の切替">
          <button
            type="button"
            className={`${styles.switchBtn}${
              variant === "A" ? ` ${styles.switchBtnActive}` : ""
            }`}
            aria-pressed={variant === "A"}
            onClick={() => setVariant("A")}
          >
            A：暫定採用版
          </button>
          <button
            type="button"
            className={`${styles.switchBtn}${
              variant === "B" ? ` ${styles.switchBtnActive}` : ""
            }`}
            aria-pressed={variant === "B"}
            onClick={() => setVariant("B")}
          >
            B：高画質新候補
          </button>
          <button
            type="button"
            className={`${styles.switchBtn}${
              variant === "C" ? ` ${styles.switchBtnActive}` : ""
            }`}
            aria-pressed={variant === "C"}
            onClick={() => setVariant("C")}
          >
            C：温もり（微調整）
          </button>
          <button
            type="button"
            className={`${styles.switchBtn}${
              variant === "D" ? ` ${styles.switchBtnActive}` : ""
            }`}
            aria-pressed={variant === "D"}
            onClick={() => setVariant("D")}
          >
            D：温もり（追加調整）
          </button>
          <button
            type="button"
            className={`${styles.switchBtn}${
              variant === "C0" ? ` ${styles.switchBtnActive}` : ""
            }`}
            aria-pressed={variant === "C0"}
            onClick={() => setVariant("C0")}
          >
            C前：調整前
          </button>
        </div>

        <p className={styles.caption}>{captionFor(variant)}</p>

        <div className={styles.stageWrap}>
          <ImageShelf
            key={variant}
            items={items}
            onOpen={setSelected}
            renderSpec={renderSpec}
          />
        </div>
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
