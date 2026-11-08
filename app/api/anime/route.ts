import { NextResponse } from "next/server";
import { hasTmdbCredentials, TMDB_ATTRIBUTION } from "../../../utils/tmdb/client";
import { searchTmdbForShelf } from "../../../utils/tmdb/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json(
      { results: [], error: "検索キーワードが必要です" },
      { status: 400 }
    );
  }

  if (!hasTmdbCredentials()) {
    console.error("アニメ検索: TMDb APIキーが設定されていません");
    return NextResponse.json(
      { results: [], error: "アニメ検索を利用できません" },
      { status: 503 }
    );
  }

  try {
    const results = await searchTmdbForShelf("anime", query);
    return NextResponse.json({
      results,
      attribution: TMDB_ATTRIBUTION,
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;

    if (status === 429) {
      return NextResponse.json(
        {
          results: [],
          error:
            "リクエストが多すぎます。しばらくしてから再試行してください",
        },
        { status: 429 }
      );
    }

    console.error("アニメ検索エラー:", {
      name: error instanceof Error ? error.name : "Error",
      status: status ?? null,
    });

    return NextResponse.json(
      { results: [], error: "アニメ検索に失敗しました" },
      { status: 502 }
    );
  }
}
