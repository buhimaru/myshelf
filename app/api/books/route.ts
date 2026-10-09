
import { NextResponse } from "next/server";

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
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("title", query);
    url.searchParams.set("limit", "20");

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Open Libraryの検索に失敗しました");
    }

    const data = await response.json();

    const results = (data.docs ?? []).map(
      (book: {
        key?: string;
        title?: string;
        author_name?: string[];
        cover_i?: number;
      }) => ({
        id: book.key ?? "",
        title: book.title ?? "",
        creator: book.author_name?.[0] ?? "",
        type: "book",
        imageUrl: book.cover_i
          ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
          : "",
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("書籍検索エラー:", error);

    return NextResponse.json(
      { results: [], error: "書籍検索に失敗しました" },
      { status: 502 }
    );
  }
}
