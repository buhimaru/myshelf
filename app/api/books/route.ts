import { NextResponse } from "next/server";

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
};

type BookResult = {
  id: string;
  title: string;
  creator: string;
  type: "book";
  imageUrl: string;
};

type SearchParams = {
  title?: string;
  author?: string;
  q?: string;
};

const FETCH_TIMEOUT_MS = 8000;

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(title: string, author: string, query: string): number {
  const q = normalizeText(query);
  const t = normalizeText(title);
  const a = normalizeText(author);
  if (!q || !t) return 0;

  let score = 0;
  const tokens = q.split(" ").filter(Boolean);

  for (let i = 1; i < tokens.length; i++) {
    const left = tokens.slice(0, i).join(" ");
    const right = tokens.slice(i).join(" ");

    if (t === left && a.includes(right)) score += 300;
    if (t === right && a.includes(left)) score += 280;
    if (t.includes(left) && a.includes(right)) score += 160;
    if (t.includes(right) && a.includes(left)) score += 140;
  }

  if (t === q) score += 120;
  if (a && q.includes(a) && q.includes(t)) score += 100;

  for (const token of tokens) {
    if (token.length < 2) continue;
    if (t === token) score += 40;
    else if (t.includes(token)) score += 20;
    if (a === token) score += 40;
    else if (a.includes(token)) score += 20;
  }

  return score;
}

function buildSearchAttempts(query: string): SearchParams[] {
  const parts = query.split(/\s+/).filter(Boolean);
  const attempts: SearchParams[] = [];

  if (parts.length === 1) {
    attempts.push({ title: query });
  } else {
    // 著者 + タイトル（例: 村上春樹 ノルウェイの森）
    attempts.push({
      author: parts[0],
      title: parts.slice(1).join(" "),
    });
    // タイトル + 著者（例: ノルウェイの森 村上春樹）
    attempts.push({
      title: parts.slice(0, -1).join(" "),
      author: parts[parts.length - 1],
    });
    // タイトル部分だけの検索
    attempts.push({ title: parts.slice(1).join(" ") });
    attempts.push({ title: parts.slice(0, -1).join(" ") });
  }

  // キーワード検索（複合検索が空のときのフォールバック）
  attempts.push({ q: query });

  return attempts;
}

async function searchOpenLibrary(
  params: SearchParams
): Promise<OpenLibraryDoc[]> {
  const url = new URL("https://openlibrary.org/search.json");
  if (params.title) url.searchParams.set("title", params.title);
  if (params.author) url.searchParams.set("author", params.author);
  if (params.q) url.searchParams.set("q", params.q);
  url.searchParams.set("limit", "20");
  url.searchParams.set("fields", "key,title,author_name,cover_i");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Open Libraryの検索に失敗しました: ${response.status}`);
    }

    const data = (await response.json()) as { docs?: OpenLibraryDoc[] };
    return data.docs ?? [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function toResults(docs: OpenLibraryDoc[], query: string): BookResult[] {
  const byId = new Map<string, BookResult & { matchScore: number }>();

  for (const book of docs) {
    const id = book.key ?? "";
    if (!id || byId.has(id)) continue;

    const title = book.title ?? "";
    const creator = book.author_name?.[0] ?? "";

    byId.set(id, {
      id,
      title,
      creator,
      type: "book",
      imageUrl: book.cover_i
        ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
        : "",
      matchScore: scoreMatch(title, creator, query),
    });
  }

  return Array.from(byId.values())
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 20)
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

  try {
    const attempts = buildSearchAttempts(query);
    let collected: OpenLibraryDoc[] = [];
    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        const docs = await searchOpenLibrary(attempt);
        if (docs.length === 0) continue;

        collected = collected.concat(docs);

        // ヒットしたら打ち切り（一致度ソートで上位を整える）
        break;
      } catch (error) {
        lastError = error;
        console.error("書籍検索試行エラー:", error);
      }
    }

    // 複合検索が空だった場合のフォールバック結果も含め、集約して並び替え
    if (collected.length === 0 && lastError) {
      throw lastError;
    }

    const results = toResults(collected, query);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("書籍検索エラー:", error);

    const message =
      error instanceof Error && error.name === "AbortError"
        ? "書籍検索がタイムアウトしました"
        : "書籍検索に失敗しました";

    return NextResponse.json({ results: [], error: message }, { status: 502 });
  }
}
