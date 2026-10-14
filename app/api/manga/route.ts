/**
 * 漫画シリーズ検索（楽天ブックス書籍検索API）
 * - 単行本単位の商品をシリーズ1件に集約して返す
 * - 巻ごとの個別登録は行わない
 * - 本番利用前に楽天の利用規約・画像利用条件の確認が必要
 */
import { NextResponse } from "next/server";

const RAKUTEN_BOOK_SEARCH_URL =
  "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";
/** Web Application の Allowed websites に登録したオリジン（固定。クライアント入力は使わない） */
const RAKUTEN_REQUEST_ORIGIN = "https://myshelf-gamma.vercel.app";
const FETCH_TIMEOUT_MS = 10000;
const RESULT_LIMIT = 20;

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

/**
 * 末尾の巻数表記だけを除去する。
 * 『20世紀少年』のようにタイトル先頭・途中の数字は消さない。
 */
export function stripVolumeSuffix(title: string): string {
  let result = title.normalize("NFKC").trim();
  if (!result) return "";

  // 明示的な巻表記（括弧付き・巻・Vol）を繰り返して除去
  const explicitPatterns = [
    /[\s　]*[（(【\[]\s*第?\s*\d{1,3}\s*巻?\s*[）)】\]]\s*$/u,
    /[\s　]*第\s*\d{1,3}\s*巻\s*$/u,
    /[\s　]*\d{1,3}\s*巻\s*$/u,
    /[\s　]*[Vv]ol(?:ume)?\.?\s*\d{1,3}\s*$/u,
    /[\s　]*[上中下]\s*巻\s*$/u,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of explicitPatterns) {
      const next = result.replace(pattern, "").trim();
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
  }

  // 空白区切りの末尾数字のみ（例: "ONE PIECE 91"）。
  // 先頭に数字がある作品名（例: "20世紀少年"）にはマッチしない。
  const bareVolume = result.match(/^(.*?)[\s　]+#?(\d{1,3})\s*$/u);
  if (bareVolume?.[1] && bareVolume[2]) {
    const num = Number.parseInt(bareVolume[2], 10);
    const head = bareVolume[1].trim();
    if (head && Number.isFinite(num) && num >= 1 && num <= 200) {
      result = head;
    }
  }

  return result.trim();
}

export function extractVolumeNumber(title: string): number | null {
  const normalized = title.normalize("NFKC");
  const patterns = [
    /[（(【\[]\s*第?\s*(\d{1,3})\s*巻?\s*[）)】\]]\s*$/u,
    /第\s*(\d{1,3})\s*巻\s*$/u,
    /(\d{1,3})\s*巻\s*$/u,
    /[Vv]ol(?:ume)?\.?\s*(\d{1,3})\s*$/u,
    /[\s　]+#?(\d{1,3})\s*$/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const num = Number.parseInt(match[1], 10);
      if (!Number.isNaN(num) && num >= 1 && num <= 200) return num;
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
  return NON_MAIN_MARKERS.some((marker) =>
    lower.includes(marker.toLowerCase())
  );
}

/**
 * 作品シリーズ名の決定。
 * 原則: 商品タイトルから巻数表記を除去したもの。
 * 楽天の seriesName はレーベル名になり得るため採用しない。
 */
export function deriveSeriesTitle(rawTitle: string): string {
  return stripVolumeSuffix(rawTitle);
}

function toCandidates(items: RakutenBookItem[]): VolumeCandidate[] {
  const candidates: VolumeCandidate[] = [];

  for (const item of items) {
    const rawTitle = (item.title ?? "").trim();
    if (!rawTitle) continue;

    const author = (item.author ?? "").trim();
    if (!author) continue;

    const seriesTitle = deriveSeriesTitle(rawTitle);
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

function scoreAgainstQuery(seriesTitle: string, query: string): number {
  const t = normalizeSeriesTitle(seriesTitle);
  const q = normalizeSeriesTitle(query);
  if (!q || !t) return 0;

  let score = 0;
  if (t === q) score += 200;
  if (t.startsWith(q)) score += 80;
  if (t.includes(q)) score += 40;

  for (const token of q.split(" ").filter((part) => part.length >= 2)) {
    if (t.includes(token)) score += 12;
  }

  return score;
}

function groupIntoSeries(
  candidates: VolumeCandidate[],
  query: string
): MangaResult[] {
  const groups = new Map<string, VolumeCandidate[]>();

  for (const candidate of candidates) {
    // 保守的: 正規化タイトル + 正規化著者の完全一致のみ同一作品とみなす
    const key = `${normalizeSeriesTitle(candidate.seriesTitle)}::${normalizeAuthor(candidate.author)}`;
    const list = groups.get(key) ?? [];
    list.push(candidate);
    groups.set(key, list);
  }

  const results: Array<MangaResult & { matchScore: number }> = [];

  for (const [, volumes] of groups) {
    if (volumes.length === 0) continue;

    // 表示用タイトルは巻1の除去後タイトルを優先（表記ゆれの代表）
    const volumeOne = volumes.find((v) => v.volumeNumber === 1);
    const representative = volumeOne ?? volumes[0];
    if (!representative) continue;

    const withVolumeOneImage = volumes.find(
      (v) => v.volumeNumber === 1 && v.imageUrl
    );
    const withAnyVolumeImage = [...volumes]
      .filter((v) => v.imageUrl)
      .sort((a, b) => {
        const av = a.volumeNumber ?? Number.MAX_SAFE_INTEGER;
        const bv = b.volumeNumber ?? Number.MAX_SAFE_INTEGER;
        return av - bv;
      })[0];

    const imageUrl =
      withVolumeOneImage?.imageUrl || withAnyVolumeImage?.imageUrl || "";

    const idSource =
      volumes.find((v) => v.volumeNumber === 1)?.isbn ||
      volumes.find((v) => v.isbn)?.isbn ||
      `${representative.seriesTitle}-${representative.author}`;

    const title = representative.seriesTitle;
    results.push({
      id: `manga:${encodeURIComponent(idSource)}`,
      title,
      creator:
        representative.author.split(/[,，、/／]/)[0]?.trim() ||
        representative.author,
      type: "manga",
      imageUrl,
      matchScore: scoreAgainstQuery(title, query),
    });
  }

  return results
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const aNonMain = isLikelyNonMainTitle(a.title) ? 1 : 0;
      const bNonMain = isLikelyNonMainTitle(b.title) ? 1 : 0;
      if (aNonMain !== bNonMain) return aNonMain - bNonMain;
      return a.title.localeCompare(b.title, "ja");
    })
    .slice(0, RESULT_LIMIT)
    .map(({ id, title, creator, type, imageUrl }) => ({
      id,
      title,
      creator,
      type,
      imageUrl,
    }));
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
    console.error("漫画検索: 楽天APIの認証情報が未設定です");
    return NextResponse.json(
      {
        results: [],
        error: "漫画検索を利用できません（外部APIの設定が必要です）",
      },
      { status: 503 }
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
        Origin: RAKUTEN_REQUEST_ORIGIN,
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
        { results: [], error: "漫画検索に失敗しました" },
        { status: 502 }
      );
    }

    if (response.status === 401 || response.status === 403) {
      console.error("漫画検索: 認証エラー");
      return NextResponse.json(
        { results: [], error: "漫画検索に失敗しました" },
        { status: 502 }
      );
    }

    if (response.status === 429) {
      console.error("漫画検索: レート制限");
      return NextResponse.json(
        {
          results: [],
          error:
            "リクエストが多すぎます。しばらくしてから再試行してください",
        },
        { status: 429 }
      );
    }

    if (!response.ok) {
      console.error("漫画検索: APIエラー", response.status);
      return NextResponse.json(
        { results: [], error: "漫画検索に失敗しました" },
        { status: 502 }
      );
    }

    const items = data.Items ?? [];
    const results = groupIntoSeries(toCandidates(items), query);

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("漫画検索: タイムアウト");
      return NextResponse.json(
        { results: [], error: "漫画検索がタイムアウトしました" },
        { status: 504 }
      );
    }

    console.error("漫画検索エラー:", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json(
      { results: [], error: "漫画検索に失敗しました" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
