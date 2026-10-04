export type MediaLookupResult = {
  id: string;
  title: string;
  authors: string;
  description: string;
  imageUrl: string;
  image_url?: string;
};

export type BookLookupResult = MediaLookupResult;

export const MEDIA_LOOKUP_NOT_FOUND = "情報が見つかりませんでした";

type GoogleBooksVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    language?: string;
    imageLinks?: {
      extraLarge?: string;
      large?: string;
      medium?: string;
      small?: string;
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
};

type GoogleBooksResponse = {
  items?: GoogleBooksVolume[];
};

export function toHttpsUrl(url: string) {
  return url.replace(/^http:\/\//i, "https://");
}

/** iTunes の artworkUrl100 を 600x600 相当に変換する。 */
export function upgradeItunesArtworkUrl(url: string) {
  if (!url) {
    return "";
  }

  return toHttpsUrl(url)
    .replace(/100x100bb/gi, "600x600bb")
    .replace(/\d+x\d+bb/gi, "600x600bb");
}

export function normalizeLookupImageUrl(url: string) {
  if (!url) {
    return "";
  }

  return upgradeGoogleBooksCoverUrl(upgradeItunesArtworkUrl(url));
}

export function pickLookupCoverUrl(
  item: { imageUrl?: string | null; image_url?: string | null },
  candidates: Array<{ imageUrl?: string | null; image_url?: string | null }> = [],
) {
  const direct = normalizeLookupImageUrl(item.imageUrl || item.image_url || "");
  if (direct) {
    return direct;
  }

  for (const candidate of candidates) {
    const next = normalizeLookupImageUrl(
      candidate.imageUrl || candidate.image_url || "",
    );
    if (next) {
      return next;
    }
  }

  return "";
}

export function resolveWorkImageUrl(work: {
  image_url?: string | null;
  imageUrl?: string | null;
}) {
  return pickLookupCoverUrl(work);
}

/** Google Books の表紙URLを高解像度（zoom=2）に寄せる。 */
export function upgradeGoogleBooksCoverUrl(url: string) {
  if (!url) {
    return url;
  }

  return toHttpsUrl(url).replace(/([?&])zoom=(?:1|5)(?=&|$)/g, "$1zoom=2");
}

function pickGoogleBooksCoverUrl(imageLinks: NonNullable<
  GoogleBooksVolume["volumeInfo"]
>["imageLinks"]) {
  if (!imageLinks) {
    return "";
  }

  const raw =
    imageLinks.extraLarge ??
    imageLinks.large ??
    imageLinks.medium ??
    imageLinks.small ??
    imageLinks.thumbnail ??
    imageLinks.smallThumbnail ??
    "";

  return raw ? upgradeGoogleBooksCoverUrl(raw) : "";
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　"'「」『』（）()【】[\]]+/g, "");
}

function queryTokens(query: string) {
  const compact = query.trim().normalize("NFKC");
  const spaced = compact.split(/[\s　]+/).filter(Boolean);
  return spaced.length > 0 ? spaced : [compact];
}

export function scoreBookAgainstQuery(book: BookLookupResult, query: string) {
  const title = normalizeSearchText(book.title);
  const authors = normalizeSearchText(book.authors);
  const description = normalizeSearchText(book.description);
  const needle = normalizeSearchText(query);

  if (!title) {
    return -1;
  }

  let score = 0;
  const tokens = queryTokens(query).map(normalizeSearchText).filter(Boolean);
  const titleContainsQuery = needle.length > 0 && title.includes(needle);
  const allTokensInTitle = tokens.every((token) => title.includes(token));

  if (title === needle) {
    score += 1000;
  } else if (title.startsWith(needle)) {
    score += 450;
  } else if (titleContainsQuery) {
    score += 320;
  } else if (allTokensInTitle) {
    score += 180;
  } else if (tokens.some((token) => title.includes(token))) {
    score += 40;
  } else {
    score -= 200;
  }

  if (book.description) {
    score += 60;
  } else {
    score -= 25;
  }

  if (book.imageUrl) {
    score += 50;
  } else {
    score -= 15;
  }

  if (book.authors) {
    score += 20;
  } else {
    score -= 10;
  }

  if (needle && description.includes(needle)) {
    score += 25;
  }
  if (needle && authors.includes(needle)) {
    score += 10;
  }

  return score;
}

export function rankBookLookupResults(
  books: BookLookupResult[],
  query: string,
): BookLookupResult[] {
  const needle = normalizeSearchText(query);
  const scored = books
    .filter((book) => book.title.trim().length > 0)
    .map((book) => ({ book, score: scoreBookAgainstQuery(book, query) }));

  const withTitleMatch = scored.filter((entry) =>
    needle ? normalizeSearchText(entry.book.title).includes(needle) : true,
  );
  const ranked = (withTitleMatch.length > 0 ? withTitleMatch : scored).sort(
    (a, b) => b.score - a.score,
  );

  return ranked.map((entry) => entry.book);
}

export function mapGoogleBooksItems(payload: unknown): BookLookupResult[] {
  if (!payload || typeof payload !== "object" || !("items" in payload)) {
    return [];
  }

  const items = (payload as GoogleBooksResponse).items ?? [];

  return items
    .map((item, index) => {
      const info = item.volumeInfo;
      return {
        id: item.id ?? `book-${index}`,
        title: info?.title?.trim() ?? "",
        authors: info?.authors?.join("、") ?? "",
        description: info?.description?.trim() ?? "",
        imageUrl: pickGoogleBooksCoverUrl(info?.imageLinks),
      };
    })
    .filter((item) => item.title);
}
