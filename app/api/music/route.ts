
import { NextResponse } from "next/server";

type MusicBrainzReleaseGroup = {
  id: string;
  title: string;
  "artist-credit"?: Array<{ name?: string }>;
};

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
    const url = new URL("https://musicbrainz.org/ws/2/release-group/");
    url.searchParams.set("query", query);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "10");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "myshelf/1.0 (https://github.com/buhimaru/myshelf)",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.status}`);
    }

    const data = await response.json();

    
const albums = (
    (data["release-groups"] ?? []) as MusicBrainzReleaseGroup[]
  );
  
  const results = albums.map((album) => ({
    id: album.id,
    title: album.title,
    creator: album["artist-credit"]?.[0]?.name ?? "",
    type: "music",
    imageUrl: "",
  }));
  
  if (results.length > 0) {
    try {
      const coverUrl = `https://coverartarchive.org/release-group/${results[0].id}/front-250`;
      const coverResponse = await fetch(coverUrl, {
        method: "HEAD",
        cache: "no-store",
      });
  
      if (coverResponse.ok) {
        results[0].imageUrl = coverUrl;
      }
    } catch (coverError) {
      console.error("ジャケット取得エラー:", coverError);
    }
  }
    

    return NextResponse.json({ results });
  } catch (error) {
    console.error("音楽検索エラー:", error);

    return NextResponse.json(
      { results: [], error: "音楽検索に失敗しました" },
      { status: 502 }
    );
  }
}
  