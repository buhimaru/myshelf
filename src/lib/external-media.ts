import {
  MEDIA_LOOKUP_NOT_FOUND,
  mapGoogleBooksItems,
  normalizeLookupImageUrl,
  rankBookLookupResults,
  toHttpsUrl,
  upgradeItunesArtworkUrl,
  type MediaLookupResult,
} from "@/lib/google-books";
import { isWorkCategory, type WorkCategory } from "@/lib/work";

export { MEDIA_LOOKUP_NOT_FOUND };

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const TMDB_SEARCH_URL = "https://api.themoviedb.org/3/search/movie";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

type JsonFetchResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

type ItunesResult = {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  longDescription?: string;
  shortDescription?: string;
  description?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  primaryGenreName?: string;
  copyright?: string;
};

type ItunesResponse = {
  results?: ItunesResult[];
};

type TmdbMovie = {
  id?: number;
  title?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
};

type TmdbSearchResponse = {
  results?: TmdbMovie[];
};

export type MediaLookupResponse = {
  items: MediaLookupResult[];
  error: string | null;
};

function getGoogleBooksApiKey() {
  return (
    process.env.GOOGLE_BOOKS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY?.trim() ||
    ""
  );
}

function getTmdbApiKey() {
  return process.env.TMDB_API_KEY?.trim() || process.env.NEXT_PUBLIC_TMDB_API_KEY?.trim() || "";
}

function getTmdbReadToken() {
  return (
    process.env.TMDB_READ_ACCESS_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_TMDB_READ_ACCESS_TOKEN?.trim() ||
    ""
  );
}

function getRakutenApplicationId() {
  return (
    process.env.RAKUTEN_APPLICATION_ID?.trim() ||
    process.env.NEXT_PUBLIC_RAKUTEN_APPLICATION_ID?.trim() ||
    ""
  );
}

async function fetchJson(url: URL, headers?: HeadersInit): Promise<JsonFetchResult> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", ...headers },
    });
    const bodyText = await response.text();
    let data: unknown = null;
    try {
      data = bodyText ? (JSON.parse(bodyText) as unknown) : null;
    } catch (error) {
      console.error("[MyShelf] JSON parse failed", url.toString(), error, bodyText.slice(0, 400));
      return { ok: false, status: response.status, data: null };
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error("[MyShelf] fetch failed", url.toString(), error);
    return { ok: false, status: 0, data: null };
  }
}

function pickItunesTitle(item: ItunesResult) {
  return (item.trackName ?? item.collectionName ?? "").trim();
}

function stripRichText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .trim();
}

function pickItunesDescription(item: ItunesResult) {
  const overview = stripRichText(
    item.longDescription ??
      item.shortDescription ??
      item.description ??
      "",
  );
  if (overview) {
    return overview;
  }

  const parts = [
    item.artistName ? `アーティスト: ${item.artistName}` : "",
    item.primaryGenreName ? `ジャンル: ${item.primaryGenreName}` : "",
    item.copyright ? item.copyright : "",
  ].filter(Boolean);

  return parts.join("\n");
}

function mapItunesItems(
  payload: unknown,
  kinds?: string[],
): MediaLookupResult[] {
  if (!payload || typeof payload !== "object" || !("results" in payload)) {
    return [];
  }

  const items = (payload as ItunesResponse).results ?? [];
  return items
    .filter((item) => {
      if (!kinds || kinds.length === 0) {
        return true;
      }
      const kind = item.kind ?? item.wrapperType ?? "";
      return kinds.includes(kind);
    })
    .map((item, index) => {
      const title = pickItunesTitle(item);
      const imageUrl = upgradeItunesArtworkUrl(
        item.artworkUrl100 ?? item.artworkUrl60 ?? "",
      );
      return {
        id: String(item.trackId ?? item.collectionId ?? item.artistId ?? `itunes-${index}`),
        title,
        authors: item.artistName?.trim() ?? "",
        description: pickItunesDescription(item),
        imageUrl,
      };
    })
    .filter((item) => item.title);
}

function mapTmdbItems(payload: unknown): MediaLookupResult[] {
  if (!payload || typeof payload !== "object" || !("results" in payload)) {
    return [];
  }

  const items = (payload as TmdbSearchResponse).results ?? [];
  return items
    .map((item, index) => {
      const title = (item.title ?? item.original_title ?? "").trim();
      const poster = item.poster_path?.trim();
      return {
        id: String(item.id ?? `tmdb-${index}`),
        title,
        authors: item.original_title && item.original_title !== item.title
          ? item.original_title
          : "",
        description: item.overview?.trim() ?? "",
        imageUrl: poster ? `${TMDB_IMAGE_BASE}${poster}` : "",
      };
    })
    .filter((item) => item.title);
}

function fillMissingCovers(items: MediaLookupResult[]) {
  const cover = items.find((item) => item.imageUrl)?.imageUrl ?? "";
  if (!cover) {
    return items;
  }

  return items.map((item) =>
    item.imageUrl ? item : { ...item, imageUrl: cover },
  );
}

function rankItems(items: MediaLookupResult[], title: string) {
  const normalized = items.map((item) => ({
    ...item,
    imageUrl: normalizeLookupImageUrl(item.imageUrl),
  }));
  const ranked = rankBookLookupResults(normalized, title);
  const filled = fillMissingCovers(ranked.length > 0 ? ranked : normalized);
  return filled.slice(0, 10);
}

function found(items: MediaLookupResult[], title: string): MediaLookupResponse {
  return { items: rankItems(items, title), error: null };
}

function notFound(): MediaLookupResponse {
  return { items: [], error: MEDIA_LOOKUP_NOT_FOUND };
}

type RakutenBookItem = {
  Item?: {
    title?: string;
    author?: string;
    artistName?: string;
    itemCaption?: string;
    largeImageUrl?: string;
    mediumImageUrl?: string;
    smallImageUrl?: string;
    isbn?: string;
  };
};

type RakutenSearchResponse = {
  Items?: RakutenBookItem[];
};

async function searchRakutenBooks(keyword: string): Promise<MediaLookupResult[]> {
  const applicationId = getRakutenApplicationId();
  if (!applicationId) {
    return [];
  }

  const endpoint = new URL(
    "https://app.rakuten.co.jp/services/api/BooksTotal/Search/20170404",
  );
  endpoint.searchParams.set("applicationId", applicationId);
  endpoint.searchParams.set("keyword", keyword);
  endpoint.searchParams.set("hits", "10");
  endpoint.searchParams.set("format", "json");

  console.log("[MyShelf] Rakuten Books request", { keyword });
  const result = await fetchJson(endpoint);
  console.log("[MyShelf] Rakuten Books status", result.status);
  if (!result.ok || !result.data || typeof result.data !== "object") {
    return [];
  }

  const items = (result.data as RakutenSearchResponse).Items ?? [];
  return items
    .map((entry, index) => {
      const item = entry.Item;
      const title = item?.title?.trim() ?? "";
      const authors = (item?.author ?? item?.artistName ?? "").trim();
      const imageUrl = toHttpsUrl(
        item?.largeImageUrl ?? item?.mediumImageUrl ?? item?.smallImageUrl ?? "",
      );
      return {
        id: item?.isbn ?? `rakuten-${index}`,
        title,
        authors,
        description: item?.itemCaption?.trim() ?? "",
        imageUrl,
      };
    })
    .filter((item) => item.title);
}

async function searchGoogleBooks(query: string): Promise<MediaLookupResult[]> {
  const apiKey = getGoogleBooksApiKey();
  const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("langRestrict", "ja");
  endpoint.searchParams.set("maxResults", "10");
  if (apiKey) {
    endpoint.searchParams.set("key", apiKey);
  }

  console.log("[MyShelf] Google Books request", {
    q: query,
    hasApiKey: Boolean(apiKey),
  });

  const result = await fetchJson(endpoint);
  console.log("[MyShelf] Google Books status", result.status);
  if (!result.ok) {
    return [];
  }
  return mapGoogleBooksItems(result.data);
}

async function searchItunes(
  term: string,
  options: {
    media?: "movie" | "music" | "tvShow";
    entity?: "album" | "song" | "tvSeason" | "tvShow";
    kinds?: string[];
    country?: string;
  } = {},
): Promise<MediaLookupResult[]> {
  const endpoint = new URL(ITUNES_SEARCH_URL);
  endpoint.searchParams.set("term", term);
  if (options.media) {
    endpoint.searchParams.set("media", options.media);
  }
  if (options.entity) {
    endpoint.searchParams.set("entity", options.entity);
  }
  endpoint.searchParams.set("country", options.country ?? "jp");
  endpoint.searchParams.set("lang", "ja_jp");
  endpoint.searchParams.set("limit", "15");

  console.log("[MyShelf] iTunes request", {
    term,
    media: options.media ?? null,
    entity: options.entity ?? null,
    country: options.country ?? "jp",
  });
  const result = await fetchJson(endpoint, {
    Accept: "application/json",
    "User-Agent": "MyShelf/1.0 (entertainment shelf)",
  });
  console.log("[MyShelf] iTunes status", result.status);
  if (!result.ok) {
    return [];
  }
  return mapItunesItems(result.data, options.kinds);
}

async function searchItunesMovies(term: string): Promise<MediaLookupResult[]> {
  return firstNonEmpty([
    () => searchItunes(term, { country: "jp", kinds: ["feature-movie"] }),
    () => searchItunes(term, { country: "us", kinds: ["feature-movie"] }),
    () =>
      searchItunes(term, {
        media: "movie",
        country: "jp",
        kinds: ["feature-movie"],
      }),
    () =>
      searchItunes(term, {
        media: "movie",
        country: "us",
        kinds: ["feature-movie"],
      }),
  ]);
}

type WikipediaSearchResponse = {
  query?: { search?: { title?: string }[] };
};

type WikipediaPage = {
  pageid?: number;
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  original?: { source?: string };
};

type WikipediaPagesResponse = {
  query?: { pages?: Record<string, WikipediaPage> };
};

const WIKI_USER_AGENT = "MyShelf/1.0 (personal entertainment shelf)";

async function searchWikipedia(term: string): Promise<MediaLookupResult[]> {
  try {
    const searchUrl = new URL("https://ja.wikipedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", term);
    searchUrl.searchParams.set("srlimit", "6");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    const searchResult = await fetchJson(searchUrl, {
      "User-Agent": WIKI_USER_AGENT,
    });
    if (!searchResult.ok || !searchResult.data) {
      return [];
    }

    const titles = ((searchResult.data as WikipediaSearchResponse).query?.search ?? [])
      .map((entry) => entry.title?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 6);

    if (titles.length === 0) {
      return [];
    }

    const pageUrl = new URL("https://ja.wikipedia.org/w/api.php");
    pageUrl.searchParams.set("action", "query");
    pageUrl.searchParams.set("prop", "pageimages|extracts");
    pageUrl.searchParams.set("exintro", "1");
    pageUrl.searchParams.set("explaintext", "1");
    pageUrl.searchParams.set("exchars", "800");
    pageUrl.searchParams.set("piprop", "thumbnail|original");
    pageUrl.searchParams.set("pithumbsize", "600");
    pageUrl.searchParams.set("redirects", "1");
    pageUrl.searchParams.set("format", "json");
    pageUrl.searchParams.set("origin", "*");
    pageUrl.searchParams.set("titles", titles.join("|"));

    const pageResult = await fetchJson(pageUrl, {
      "User-Agent": WIKI_USER_AGENT,
    });
    if (!pageResult.ok || !pageResult.data) {
      return [];
    }

    const pages = Object.values(
      (pageResult.data as WikipediaPagesResponse).query?.pages ?? {},
    );

    return pages
      .map((page, index) => {
        const title = page.title?.trim() ?? "";
        const imageUrl = toHttpsUrl(
          page.original?.source ?? page.thumbnail?.source ?? "",
        );
        return {
          id: String(page.pageid ?? `wiki-${index}`),
          title,
          authors: "",
          description: page.extract?.trim() ?? "",
          imageUrl,
        };
      })
      .filter((item) => item.title && (item.description || item.imageUrl));
  } catch (error) {
    console.error("[MyShelf] Wikipedia lookup failed", error);
    return [];
  }
}

function mergeLookupResults(groups: MediaLookupResult[][]) {
  const seen = new Set<string>();
  const merged: MediaLookupResult[] = [];

  for (const group of groups) {
    for (const item of group) {
      const key = `${item.title.normalize("NFKC").toLowerCase()}|${item.authors}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

async function searchTmdbMovies(term: string): Promise<MediaLookupResult[]> {
  const apiKey = getTmdbApiKey();
  const token = getTmdbReadToken();
  if (!apiKey && !token) {
    return [];
  }

  const endpoint = new URL(TMDB_SEARCH_URL);
  endpoint.searchParams.set("query", term);
  endpoint.searchParams.set("language", "ja-JP");
  endpoint.searchParams.set("include_adult", "false");
  if (apiKey) {
    endpoint.searchParams.set("api_key", apiKey);
  }

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  console.log("[MyShelf] TMDB request", { term, hasApiKey: Boolean(apiKey), hasToken: Boolean(token) });
  const result = await fetchJson(endpoint, headers);
  console.log("[MyShelf] TMDB status", result.status);
  if (!result.ok) {
    return [];
  }
  return mapTmdbItems(result.data);
}

async function firstNonEmpty(
  factories: Array<() => Promise<MediaLookupResult[]>>,
): Promise<MediaLookupResult[]> {
  for (const factory of factories) {
    const items = await factory();
    if (items.length > 0) {
      return items;
    }
  }
  return [];
}

async function lookupBooks(title: string): Promise<MediaLookupResponse> {
  const [google, rakuten] = await Promise.all([
    firstNonEmpty([
      () => searchGoogleBooks(title),
      () => searchGoogleBooks(`intitle:${title}`),
    ]),
    searchRakutenBooks(title),
  ]);
  const items = mergeLookupResults([google, rakuten]);
  return items.length > 0 ? found(items, title) : notFound();
}

async function lookupAnime(title: string): Promise<MediaLookupResponse> {
  const [google, rakuten, seasons, shows] = await Promise.all([
    firstNonEmpty([
      () => searchGoogleBooks(title),
      () => searchGoogleBooks(`intitle:${title}`),
      () => searchGoogleBooks(`${title} 漫画`),
      () => searchGoogleBooks(`${title} コミック`),
      () => searchGoogleBooks(`${title} アニメ`),
    ]),
    searchRakutenBooks(`${title} 漫画`),
    searchItunes(title, { entity: "tvSeason" }),
    searchItunes(title, { entity: "tvShow", media: "tvShow" }),
  ]);
  const items = mergeLookupResults([google, rakuten, seasons, shows]);
  return items.length > 0 ? found(items, title) : notFound();
}

async function lookupMovies(title: string): Promise<MediaLookupResponse> {
  const [itunes, tmdb, wiki, books] = await Promise.all([
    searchItunesMovies(title),
    searchTmdbMovies(title),
    searchWikipedia(title),
    searchGoogleBooks(title),
  ]);
  const items = mergeLookupResults([itunes, tmdb, wiki, books]);
  return items.length > 0 ? found(items, title) : notFound();
}

async function lookupMusic(title: string): Promise<MediaLookupResponse> {
  const items = await firstNonEmpty([
    () =>
      searchItunes(title, {
        media: "music",
        entity: "album",
        country: "jp",
      }),
    () =>
      searchItunes(title, {
        media: "music",
        entity: "album",
        country: "us",
      }),
    () => searchItunes(title, { media: "music", entity: "song", country: "jp" }),
  ]);
  return items.length > 0 ? found(items, title) : notFound();
}

function enrichCatalogItem(item: MediaLookupResult): MediaLookupResult {
  return {
    ...item,
    imageUrl: normalizeLookupImageUrl(item.imageUrl),
    description: stripRichText(item.description),
  };
}

export async function searchCatalogByCategory(
  query: string,
  category: WorkCategory,
): Promise<MediaLookupResponse> {
  const q = query.trim();
  if (!q) {
    return notFound();
  }

  try {
    if (category === "movie" || category === "music") {
      const endpoint = new URL(ITUNES_SEARCH_URL);
      endpoint.searchParams.set("country", "jp");
      endpoint.searchParams.set("media", category);
      endpoint.searchParams.set("term", q);
      if (category === "music") {
        endpoint.searchParams.set("entity", "album");
      }
      endpoint.searchParams.set("limit", "12");
      endpoint.searchParams.set("lang", "ja_jp");

      console.log("[MyShelf] catalog iTunes", { category, q });
      const result = await fetchJson(endpoint, {
        Accept: "application/json",
        "User-Agent": "MyShelf/1.0 (entertainment shelf)",
      });
      const mapped = mapItunesItems(result.data);
      const movies = mapItunesItems(result.data, ["feature-movie"]);
      let items = (category === "movie" ? movies : mapped).map(enrichCatalogItem);

      if (items.length === 0 && category === "movie") {
        items = (await searchItunesMovies(q)).map(enrichCatalogItem);
      }
      if (items.length === 0 && category === "music") {
        items = (
          await firstNonEmpty([
            () =>
              searchItunes(q, {
                media: "music",
                entity: "album",
                country: "us",
              }),
            () =>
              searchItunes(q, {
                media: "music",
                entity: "song",
                country: "jp",
              }),
          ])
        ).map(enrichCatalogItem);
      }

      return items.length > 0 ? found(items, q) : notFound();
    }

    const googleQuery = category === "anime" ? `${q} 漫画` : q;
    const [google, extra, rakuten] = await Promise.all([
      searchGoogleBooks(q),
      category === "anime"
        ? searchGoogleBooks(googleQuery)
        : searchGoogleBooks(`intitle:${q}`),
      searchRakutenBooks(q),
    ]);
    const items = mergeLookupResults([google, extra, rakuten]).map(
      enrichCatalogItem,
    );
    return items.length > 0 ? found(items, q) : notFound();
  } catch (error) {
    console.error("[MyShelf] searchCatalogByCategory failed", { query, category }, error);
    return notFound();
  }
}

export function parseLookupCategory(value: string | null): WorkCategory | null {
  if (!value) {
    return null;
  }
  return isWorkCategory(value) ? value : null;
}

export async function lookupExternalMedia(
  title: string,
  category: WorkCategory,
): Promise<MediaLookupResponse> {
  try {
    switch (category) {
      case "book":
        return await lookupBooks(title);
      case "anime":
        return await lookupAnime(title);
      case "movie":
        return await lookupMovies(title);
      case "music":
        return await lookupMusic(title);
      default:
        return notFound();
    }
  } catch (error) {
    console.error("[MyShelf] lookupExternalMedia failed", { title, category }, error);
    return notFound();
  }
}
