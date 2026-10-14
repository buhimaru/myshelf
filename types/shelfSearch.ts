export type ShelfSearchSortOrder = "newest" | "oldest";

export type ShelfSearchHit = {
  userId: string;
  displayName: string;
  representativeTitle: string;
  representativeCategory: string | null;
  representativeCreatedAt: string | null;
  matchCount: number;
};

export type ShelfSearchResult = {
  totalCount: number;
  limit: number;
  offset: number;
  sortOrder: ShelfSearchSortOrder;
  query: string;
  rows: ShelfSearchHit[];
};

export const SHELF_SEARCH_MIN_LENGTH = 2;
export const SHELF_SEARCH_MAX_LENGTH = 100;
export const SHELF_SEARCH_PAGE_SIZE = 20;
