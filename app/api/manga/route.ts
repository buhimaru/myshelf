/**
 * 漫画シリーズ検索（ローカル開発用の試験実装）
 * 楽天ブックス書籍検索APIを利用。本番公開前に利用規約・画像利用条件の確認が必要。
 */
import { NextResponse } from "next/server";

const RAKUTEN_BOOK_SEARCH_URL =
  "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";
const FETCH_TIMEOUT_MS = 10000;

type MangaResult = {
  id: string;
  title: string;
  creator: string;
  type: "manga";
  imageUrl: string;
};

type RakutenBookItem = {
  title?: string;
  seriesName?: string;
  author?: string;
  isbn?: string;
  largeImageUrl?: string;
  mediumImageUrl?: string;
  smallImageUrl?: string;
  size?: string | number;
  booksGenreId?: string;
};

type VolumeCandidate = {
  rawTitle: string;
  seriesTitle: string;
  author: string;
  isbn: string;
  imageUrl: string;
  volumeNumber: number | null;
};

/** 外伝・ガイド等はシリーズ名に残し、本編と別グループにする */
const NON_MAIN_MARKERS = [
  "外伝",
  "ガイド",
  "ガイドブック",
  "公式",
  "画集",
  "イラスト",
  "ファンブック",
  "character",
  "キャラクター",
  "novel",
  "ノベル",
  "小説",
  "before the fall",
  "lost girls",
  "悔いなき選択",
  "inside",
  "outside",
  "spoof",
  "スピンオフ",
];

function normalizeAuthor(author: string): string {
  return author
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[,，、/／].*$/, "")
    .trim()
    .toLowerCase();
}

function normalizeSeriesTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripVolumeSuffix(title: string): string {
  let result = title.normalize("NFKC").trim();

  // 末尾の巻数表記のみ除去（タイトル本体は残す）
  const patterns = [
    /[\s　]*[（(【\[]\s*第?\s*\d+\s*巻?\s*[）)】\]]\s*$/u,
    /[\s　]*第\s*\d+\s*巻\s*$/u,
    /[\s　]*\d+\s*巻\s*$/u,
    /[\s　]*[Vv]ol\.?\s*\d+\s*$/u,
    /[\s　]+#?\d{1,3}\s*$/u,
  ];

  for (const pattern of patterns) {
    result = result.replace(pattern, "").trim();
  }

  return result;
}

function extractVolumeNumber(title: string): number | null {
  const normalized = title.normalize("NFKC");
  const patterns = [
    /[（(【\[]\s*第?\s*(\d+)\s*巻?\s*[）)】\]]\s*$/u,
    /第\s*(\d+)\s*巻\s*$/u,
    /(\d+)\s*巻\s*$/u,
    /[Vv]ol\.?\s*(\d+)\s*$/u,
    /[\s　]+#?(\d{1,3})\s*$/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const num = Number.parseInt(match[1], 10);
      if (!Number.isNaN(num)) return num;
    }
  }

  return null;
}

function pickImageUrl(item: RakutenBookItem): string {
  return (
    item.largeImageUrl ||
    item.mediumImageUrl ||
    item.smallImageUrl ||
    ""
  ).trim();
}

function isLikelyNonMainTitle(seriesTitle: string): boolean {
  const lower = seriesTitle.toLowerCase();
  return NON_MAIN_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

function toCandidates(items: RakutenBookItem[]): VolumeCandidate[] {
  const candidates: VolumeCandidate[] = [];

  for (const item of items) {
    const rawTitle = (item.title ?? "").trim();
    if (!rawTitle) continue;

    const author = (item.author ?? "").trim();
    if (!author) continue;

    // seriesName があれば優先（巻タイトルよりシリーズ単位に近い）
    const baseFromSeries = (item.seriesName ?? "").trim();
    const seriesTitle = stripVolumeSuffix(
      baseFromSeries || rawTitle
    );

    if (!seriesTitle) continue;

    candidates.push({
      rawTitle,
      seriesTitle,
      author,
      isbn: (item.isbn ?? "").trim(),
      imageUrl: pickImageUrl(item),
      volumeNumber: extractVolumeNumber(rawTitle),
    });
  }

  return candidates;
}

function groupIntoSeries(candidates: VolumeCandidate[]): MangaResult[] {
  const groups = new Map<string, VolumeCandidate[]>();

  for (const candidate of candidates) {
    // 保守的: 正規化タイトル + 正規化著者の完全一致のみ同一作品とみなす
    const key = `${normalizeSeriesTitle(candidate.seriesTitle)}::${normalizeAuthor(candidate.author)}`;
    const list = groups.get(key) ?? [];
    list.push(candidate);
    groups.set(key, list);
  }

  const results: MangaResult[] = [];

  for (const [, volumes] of groups) {
    const representative = volumes[0];
    if (!representative) continue;

    // 単巻しかなく外伝マーカー付きのものは単独作品として返す（除外しない）
    // 本編グループへの誤結合は key の厳密一致で既に防いでいる

    const withVolumeOne = volumes.find(
      (v) => v.volumeNumber === 1 && v.imageUrl
    );
    const withAnyVolumeImage = [...volumes]
      .filter((v) => v.imageUrl)
      .sort((a, b) => {
        const av = a.volumeNumber ?? Number.MAX_SAFE_INTEGER;
        const bv = b.volumeNumber ?? Number.MAX_SAFE_INTEGER;
        return av - bv;
      })[0];

    const imageUrl = withVolumeOne?.imageUrl || withAnyVolumeImage?.imageUrl || "";

    const idSource =
      volumes.find((v) => v.volumeNumber === 1)?.isbn ||
      volumes.find((v) => v.isbn)?.isbn ||
      `${representative.seriesTitle}-${representative.author}`;

    results.push({
      id: `manga:${encodeURIComponent(idSource)}`,
      title: representative.seriesTitle,
      creator: representative.author.split(/[,，、/／]/)[0]?.trim() || representative.author,
      type: "manga",
      imageUrl,
    });
  }

  // クエリとの近い本編（外伝マーカーなし）を上位に
  return results.sort((a, b) => {
    const aNonMain = isLikelyNonMainTitle(a.title) ? 1 : 0;
    const bNonMain = isLikelyNonMainTitle(b.title) ? 1 : 0;
    if (aNonMain !== bNonMain) return aNonMain - bNonMain;
    return a.title.localeCompare(b.title, "ja");
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      { results: [], error: "検索キーワードが必要です" },
      { status: 400 }
    );
  }

  const applicationId = process.env.RAKUTEN_APPLICATION_ID?.trim();
  const accessKey = process.env.RAKUTEN_ACCESS_KEY?.trim();

  if (!applicationId || !accessKey) {
    return NextResponse.json(
      {
        results: [],
        error:
          "楽天APIの認証情報が未設定です。RAKUTEN_APPLICATION_ID と RAKUTEN_ACCESS_KEY を .env.local に設定してください",
      },
      { status: 500 }
    );
  }

  const url = new URL(RAKUTEN_BOOK_SEARCH_URL);
  url.searchParams.set("applicationId", applicationId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("title", query);
  url.searchParams.set("size", "9"); // コミック
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("outOfStockFlag", "1");
  url.searchParams.set("sort", "standard");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const rawText = await response.text();
    let data: {
      Items?: RakutenBookItem[];
      error?: string;
      error_description?: string;
    } = {};

    try {
      data = rawText ? (JSON.parse(rawText) as typeof data) : {};
    } catch {
      console.error("漫画検索: JSONパース失敗", rawText.slice(0, 200));
      return NextResponse.json(
        { results: [], error: "楽天APIの応答形式が不正です" },
        { status: 502 }
      );
    }

    if (response.status === 401 || response.status === 403) {
      console.error("漫画検索: 認証エラー", data);
      return NextResponse.json(
        {
          results: [],
          error: data.error_description || "楽天APIの認証に失敗しました",
          rakutenError: data.error ?? null,
        },
        { status: 502 }
      );
    }

    if (response.status === 429) {
      console.error("漫画検索: レート制限", data);
      return NextResponse.json(
        {
          results: [],
          error: "楽天APIのリクエスト上限に達しました。しばらくしてから再試行してください",
          rakutenError: data.error ?? "too_many_requests",
        },
        { status: 429 }
      );
    }

    if (!response.ok) {
      console.error("漫画検索: APIエラー", response.status, data);
      return NextResponse.json(
        {
          results: [],
          error:
            data.error_description ||
            `楽天APIエラー (${response.status})`,
          rakutenError: data.error ?? null,
        },
        { status: 502 }
      );
    }

    const items = data.Items ?? [];
    const results = groupIntoSeries(toCandidates(items));

    return NextResponse.json({
      results,
      meta: {
        source: "rakuten-books-book-search",
        note: "local-dev-experimental",
        rawItemCount: items.length,
        seriesCount: results.length,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("漫画検索: タイムアウト");
      return NextResponse.json(
        { results: [], error: "楽天APIへの接続がタイムアウトしました" },
        { status: 504 }
      );
    }

    console.error("漫画検索エラー:", error);
    return NextResponse.json(
      { results: [], error: "漫画検索に失敗しました" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
