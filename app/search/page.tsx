import { Suspense } from "react";
import ShelfSearchView from "../../components/ShelfSearchView";

export const metadata = {
  title: "棚を探す | myshelf",
  description: "作品名から公開棚を探せます。",
};

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="lp shelf-search-page">
          <main className="shelf-search-main">
            <p className="shelf-search-message" aria-live="polite">
              読み込み中...
            </p>
          </main>
        </div>
      }
    >
      <ShelfSearchView />
    </Suspense>
  );
}
