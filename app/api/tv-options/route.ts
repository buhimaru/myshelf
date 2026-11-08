import { NextResponse } from "next/server";
import { hasTmdbCredentials, TMDB_ATTRIBUTION } from "../../../utils/tmdb/client";
import { getTvRegisterOptions } from "../../../utils/tmdb/tvOptions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idRaw = searchParams.get("id")?.trim() ?? "";
  const kindRaw = searchParams.get("kind")?.trim() ?? "";
  const tmdbId = Number(idRaw);
  const kind = kindRaw === "anime" || kindRaw === "drama" ? kindRaw : null;

  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !kind) {
    return NextResponse.json(
      { options: [], error: "作品IDとジャンルが必要です" },
      { status: 400 }
    );
  }

  if (!hasTmdbCredentials()) {
    console.error("TVオプション: TMDb APIキーが設定されていません");
    return NextResponse.json(
      { options: [], error: "作品情報を取得できません" },
      { status: 503 }
    );
  }

  try {
    const data = await getTvRegisterOptions(tmdbId, kind, {
      title: searchParams.get("title")?.trim() || undefined,
      imageUrl: searchParams.get("imageUrl")?.trim() || undefined,
      year: searchParams.get("year")?.trim() || undefined,
    });

    return NextResponse.json({
      options: data.options,
      creator: data.creator,
      creatorRole: data.creatorRole,
      creatorRoleLabel: data.creatorRoleLabel,
      seriesTitle: data.seriesTitle,
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
          options: [],
          error:
            "リクエストが多すぎます。しばらくしてから再試行してください",
        },
        { status: 429 }
      );
    }

    console.error("TVオプション取得エラー:", {
      name: error instanceof Error ? error.name : "Error",
      status: status ?? null,
    });

    return NextResponse.json(
      { options: [], error: "シーズン情報の取得に失敗しました" },
      { status: 502 }
    );
  }
}
