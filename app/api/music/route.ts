import { NextResponse } from "next/server";

type MusicBrainzReleaseGroup = {
  id: string;
  title?: string;
  score?: number;
  "artist-credit"?: Array<{ name?: string }>;
};

type MusicResult = {
  id: string;
  title: string;
  creator: string;
  type: "music";
  imageUrl: string;
};

const USER_AGENT = "myshelf/1.0 (https://github.com/buhimaru/myshelf)";

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLucene(value: string): string {
  return value.replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, "\\$1");
}

function buildSearchQueries(query: string): string[] {
  const queries = new Set<string>([query]);
  const parts = query.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    // 「Nevermind Nirvana」= アルバム + アーティスト を優先
    const albumThenArtist = parts.slice(0, -1).join(" ");
    const artistTail = parts[parts.length - 1] ?? "";
    queries.add(
      `releasegroup:"${escapeLucene(albumThenArtist)}" AND artist:"${escapeLucene(artistTail)}"`
    );

    // 「Nirvana Nevermind」= アーティスト + アルバム
    const artistHead = parts[0] ?? "";
    const artistThenAlbum = parts.slice(1).join(" ");
    queries.add(
      `releasegroup:"${escapeLucene(artistThenAlbum)}" AND artist:"${escapeLucene(artistHead)}"`
    );
  }

  return Array.from(queries);
}

function scoreMatch(title: string, artist: string, query: string): number {
  const q = normalizeText(query);
  const t = normalizeText(title);
  const a = normalizeText(artist);
  if (!q || !t) return 0;

  let score = 0;
  const tokens = q.split(" ").filter(Boolean);

  for (let i = 1; i < tokens.length; i++) {
    const left = tokens.slice(0, i).join(" ");
    const right = tokens.slice(i).join(" ");

    if (t === left && a === right) score += 300;
    if (t === right && a === left) score += 280;
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

async function searchReleaseGroups(query: string): Promise<MusicBrainzReleaseGroup[]> {
  const url = new URL("https://musicbrainz.org/ws/2/release-group/");
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "10");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    "release-groups"?: MusicBrainzReleaseGroup[];
  };

  return data["release-groups"] ?? [];
}

async function fetchCoverUrl(id: string): Promise<string> {
  const coverUrl = `https://coverartarchive.org/release-group/${id}/front-250`;

  try {
    const coverResponse = await fetch(coverUrl, {
      method: "HEAD",
      cache: "no-store",
      redirect: "follow",
    });

    return coverResponse.ok ? coverUrl : "";
  } catch (coverError) {
    console.error("ジャケット取得エラー:", coverError);
    return "";
  }
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
    const searchQueries = buildSearchQueries(query);

    // 単純検索 + アルバム/アーティスト指定検索を組み合わせる
    const albumGroups = await Promise.all(
      searchQueries.map((searchQuery) => searchReleaseGroups(searchQuery))
    );

    const albumMap = new Map<string, MusicBrainzReleaseGroup>();
    for (const albums of albumGroups) {
      for (const album of albums) {
        if (!album.id || albumMap.has(album.id)) continue;
        albumMap.set(album.id, album);
      }
    }

    const ranked = Array.from(albumMap.values())
      .map((album) => {
        const title = album.title ?? "";
        const creator = album["artist-credit"]?.[0]?.name ?? "";
        return {
          id: album.id,
          title,
          creator,
          type: "music" as const,
          imageUrl: "",
          matchScore: scoreMatch(title, creator, query),
          apiScore: album.score ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return b.apiScore - a.apiScore;
      })
      .slice(0, 10);

    // 各結果のジャケットを確認（無くても結果から除外しない）
    const results: MusicResult[] = await Promise.all(
      ranked.map(async ({ id, title, creator, type }) => ({
        id,
        title,
        creator,
        type,
        imageUrl: await fetchCoverUrl(id),
      }))
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("音楽検索エラー:", error);

    return NextResponse.json(
      { results: [], error: "音楽検索に失敗しました" },
      { status: 502 }
    );
  }
}
