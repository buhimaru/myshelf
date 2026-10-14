"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShelfSearchResult, ShelfSearchSortOrder } from "../types/shelfSearch";
import {
  SHELF_SEARCH_MAX_LENGTH,
  SHELF_SEARCH_MIN_LENGTH,
  SHELF_SEARCH_PAGE_SIZE,
} from "../types/shelfSearch";
import { SHELF_TYPE_LABEL } from "../utils/shelfDisplay";
import { createClient } from "../utils/supabase/client";
import {
  searchPublicShelvesByTitle,
  validateShelfSearchQuery,
} from "../utils/supabase/shelfSearch";
import SiteHeader from "./SiteHeader";

const SEARCH_ERROR_MESSAGE =
  "検索に失敗しました。時間をおいて再度お試しください。";

function formatAddedAt(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function categoryLabel(category: string | null): string {
  if (!category) return "作品";
  return SHELF_TYPE_LABEL[category] ?? category;
}

function totalPagesForCount(totalCount: number): number {
  if (totalCount <= 0) return 1;
  return Math.max(1, Math.ceil(totalCount / SHELF_SEARCH_PAGE_SIZE));
}

export default function ShelfSearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const requestIdRef = useRef(0);

  const urlQuery = searchParams.get("q") ?? "";
  const urlSort: ShelfSearchSortOrder =
    searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const urlPage = Math.max(Number(searchParams.get("page") ?? "1") || 1, 1);

  const [input, setInput] = useState(urlQuery);
  const [sortOrder, setSortOrder] = useState<ShelfSearchSortOrder>(urlSort);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationHint, setValidationHint] = useState("");
  const [result, setResult] = useState<ShelfSearchResult | null>(null);
  const [searched, setSearched] = useState(false);

  const offset = (urlPage - 1) * SHELF_SEARCH_PAGE_SIZE;

  const totalPages = useMemo(() => {
    if (!result) return 1;
    return totalPagesForCount(result.totalCount);
  }, [result]);

  const replaceUrl = useCallback(
    (next: { q: string; sort: ShelfSearchSortOrder; page: number }) => {
      const params = new URLSearchParams();
      if (next.q) params.set("q", next.q);
      if (next.sort === "oldest") params.set("sort", "oldest");
      if (next.page > 1) params.set("page", String(next.page));
      const qs = params.toString();
      router.replace(qs ? `/search?${qs}` : "/search");
    },
    [router]
  );

  const runSearch = useCallback(
    async (args: {
      query: string;
      sort: ShelfSearchSortOrder;
      page: number;
    }) => {
      const requestId = ++requestIdRef.current;
      const validated = validateShelfSearchQuery(args.query);
      if (!validated.ok) {
        if (requestId !== requestIdRef.current) return;
        setValidationHint(validated.error);
        setError("");
        setResult(null);
        setSearched(false);
        setLoading(false);
        return;
      }

      setValidationHint("");
      setLoading(true);
      setError("");
      setSearched(true);

      const pageOffset = (Math.max(args.page, 1) - 1) * SHELF_SEARCH_PAGE_SIZE;
      const { data, error: rpcError } = await searchPublicShelvesByTitle(
        supabase,
        {
          query: validated.query,
          sortOrder: args.sort,
          limit: SHELF_SEARCH_PAGE_SIZE,
          offset: pageOffset,
        }
      );

      if (requestId !== requestIdRef.current) return;

      if (rpcError) {
        setResult(null);
        setError(SEARCH_ERROR_MESSAGE);
        setLoading(false);
        return;
      }

      if (!data) {
        setResult(null);
        setError(SEARCH_ERROR_MESSAGE);
        setLoading(false);
        return;
      }

      const pages = totalPagesForCount(data.totalCount);
      if (args.page > pages) {
        // URL を有効ページへ寄せ、effect 経由で再取得する（この応答では結果を確定しない）
        replaceUrl({
          q: validated.query,
          sort: args.sort,
          page: pages,
        });
        return;
      }

      setResult(data);
      setLoading(false);
    },
    [replaceUrl, supabase]
  );

  useEffect(() => {
    setInput(urlQuery);
    setSortOrder(urlSort);
  }, [urlQuery, urlSort]);

  useEffect(() => {
    const q = urlQuery.trim();
    if (!q) {
      requestIdRef.current += 1;
      setResult(null);
      setError("");
      setValidationHint("");
      setSearched(false);
      setLoading(false);
      return;
    }

    void runSearch({ query: q, sort: urlSort, page: urlPage });
  }, [urlQuery, urlSort, urlPage, runSearch]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const validated = validateShelfSearchQuery(input);
    if (!validated.ok) {
      setValidationHint(validated.error);
      setError("");
      setResult(null);
      setSearched(false);
      return;
    }
    replaceUrl({ q: validated.query, sort: sortOrder, page: 1 });
  };

  const handleSortChange = (next: ShelfSearchSortOrder) => {
    if (loading) return;
    const q = input.trim() || urlQuery.trim();
    if (!q) {
      replaceUrl({ q: "", sort: next, page: 1 });
      return;
    }
    const validated = validateShelfSearchQuery(q);
    if (!validated.ok) {
      setValidationHint(validated.error);
      return;
    }
    replaceUrl({ q: validated.query, sort: next, page: 1 });
  };

  const goToPage = (page: number) => {
    const q = urlQuery.trim();
    if (!q) return;
    replaceUrl({ q, sort: urlSort, page });
  };

  return (
    <div className="lp shelf-search-page">
      <SiteHeader active="search" />

      <main className="shelf-search-main">
        <header className="shelf-search-hero">
          <h1 className="shelf-search-title">棚を探す</h1>
          <p className="shelf-search-lead">
            作品名で、その作品を置いている公開棚を探せます。ジャンルは問いません。
          </p>
        </header>

        <form className="shelf-search-form" onSubmit={handleSubmit}>
          <label className="shelf-search-label" htmlFor="shelf-search-query">
            作品名
          </label>
          <div className="shelf-search-row">
            <input
              id="shelf-search-query"
              className="shelf-search-input"
              type="search"
              value={input}
              maxLength={SHELF_SEARCH_MAX_LENGTH}
              placeholder="例: ノルウェイの森"
              autoComplete="off"
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="shelf-search-submit" disabled={loading}>
              {loading ? "検索中..." : "検索"}
            </button>
          </div>
          <p className="shelf-search-hint">
            {SHELF_SEARCH_MIN_LENGTH}〜{SHELF_SEARCH_MAX_LENGTH}
            文字。非公開の棚は結果に含まれません。
          </p>

          <div className="shelf-search-sort" role="group" aria-label="並び替え">
            <span className="shelf-search-sort-label">並び替え</span>
            <button
              type="button"
              className={`shelf-search-sort-btn${sortOrder === "newest" ? " is-active" : ""}`}
              onClick={() => handleSortChange("newest")}
              disabled={loading}
            >
              新しい追加日順
            </button>
            <button
              type="button"
              className={`shelf-search-sort-btn${sortOrder === "oldest" ? " is-active" : ""}`}
              onClick={() => handleSortChange("oldest")}
              disabled={loading}
            >
              古い追加日順
            </button>
          </div>
        </form>

        {validationHint && (
          <p className="shelf-search-message" role="status">
            {validationHint}
          </p>
        )}

        {loading && (
          <p className="shelf-search-message" aria-live="polite">
            読み込み中...
          </p>
        )}

        {!loading && error && (
          <p className="shelf-error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && searched && result && result.totalCount === 0 && (
          <p className="shelf-search-message" role="status">
            「{result.query}」に一致する公開棚は見つかりませんでした。
          </p>
        )}

        {!loading && !error && result && result.totalCount > 0 && (
          <section className="shelf-search-results" aria-live="polite">
            <p className="shelf-search-count">
              {result.totalCount}件の公開棚
              {result.totalCount > SHELF_SEARCH_PAGE_SIZE
                ? `（${offset + 1}–${offset + result.rows.length}件を表示）`
                : null}
            </p>

            <ul className="shelf-search-list">
              {result.rows.map((hit) => (
                <li key={hit.userId} className="shelf-search-item">
                  <div className="shelf-search-item-main">
                    <p className="shelf-search-owner">{hit.displayName}</p>
                    <p className="shelf-search-work">
                      <span className="shelf-search-work-title">
                        {hit.representativeTitle}
                      </span>
                      <span className="shelf-search-work-meta">
                        {categoryLabel(hit.representativeCategory)}
                        {hit.matchCount > 1
                          ? ` · 一致${hit.matchCount}件`
                          : null}
                        {hit.representativeCreatedAt
                          ? ` · ${formatAddedAt(hit.representativeCreatedAt)}追加`
                          : null}
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/shelf/${hit.userId}`}
                    className="shelf-search-visit"
                  >
                    棚を見る
                  </Link>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <nav className="shelf-search-pager" aria-label="検索結果のページ">
                <button
                  type="button"
                  className="shelf-search-pager-btn"
                  disabled={urlPage <= 1 || loading}
                  onClick={() => goToPage(urlPage - 1)}
                >
                  前へ
                </button>
                <span className="shelf-search-pager-status">
                  {urlPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="shelf-search-pager-btn"
                  disabled={urlPage >= totalPages || loading}
                  onClick={() => goToPage(urlPage + 1)}
                >
                  次へ
                </button>
              </nav>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
