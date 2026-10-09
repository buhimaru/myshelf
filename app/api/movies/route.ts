import { NextResponse } from "next/server";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "myshelf/1.0 (https://github.com/buhimaru/myshelf; personal shelf app)";

type MovieResult = {
  id: string;
  title: string;
  creator: string;
  type: "movie";
  imageUrl: string;
};

type SparqlBinding = {
  item?: { value?: string };
  itemLabel?: { value?: string };
  directorLabel?: { value?: string };
  image?: { value?: string };
};

type SparqlResponse = {
  results?: {
    bindings?: SparqlBinding[];
  };
};

function escapeSparqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function extractEntityId(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? "";
}

function toImageUrl(imageValue: string | undefined): string {
  if (!imageValue) return "";

  try {
    const url = new URL(imageValue.replace(/^http:/, "https:"));
    url.searchParams.set("width", "300");
    return url.toString();
  } catch {
    return "";
  }
}

function buildSparql(query: string): string {
  const search = escapeSparqlString(query);
  const hasJapanese = /[\u3040-\u30ff\u3400-\u9fff]/.test(query);
  const searchLanguage = hasJapanese ? "ja" : "en";

  // EntitySearch で候補を取得し、映画（および下位クラス）に絞り込む。
  // テキスト検索を SPARQL REGEX に任せない（Wikidata推奨）。
  return `
SELECT DISTINCT ?item ?itemLabel ?directorLabel ?image WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "EntitySearch" .
    bd:serviceParam wikibase:endpoint "www.wikidata.org" .
    bd:serviceParam mwapi:search "${search}" .
    bd:serviceParam mwapi:language "${searchLanguage}" .
    bd:serviceParam mwapi:limit "20" .
    ?item wikibase:apiOutputItem mwapi:item .
  }
  ?item wdt:P31/wdt:P279* wd:Q11424 .
  OPTIONAL { ?item wdt:P57 ?director . }
  OPTIONAL { ?item wdt:P18 ?image . }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "ja,en" .
    ?item rdfs:label ?itemLabel .
    ?director rdfs:label ?directorLabel .
  }
}
LIMIT 20
`.trim();
}

function mapResults(bindings: SparqlBinding[]): MovieResult[] {
  const byId = new Map<string, MovieResult>();

  for (const binding of bindings) {
    const id = extractEntityId(binding.item?.value ?? "");
    if (!id) continue;

    const existing = byId.get(id);
    const creator = binding.directorLabel?.value ?? "";
    const imageUrl = toImageUrl(binding.image?.value);

    if (!existing) {
      byId.set(id, {
        id,
        title: binding.itemLabel?.value ?? "",
        creator,
        type: "movie",
        imageUrl,
      });
      continue;
    }

    if (!existing.creator && creator) {
      existing.creator = creator;
    }
    if (!existing.imageUrl && imageUrl) {
      existing.imageUrl = imageUrl;
    }
  }

  return Array.from(byId.values()).slice(0, 20);
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
    const response = await fetch(SPARQL_ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/sparql-results+json",
        "Accept-Encoding": "gzip",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({
        query: buildSparql(query),
        format: "json",
      }),
      // Wikidataへの過剰アクセスを避けるため、Nextの勝手な再検証キャッシュは使わない
      cache: "no-store",
    });

    if (response.status === 429) {
      return NextResponse.json(
        { results: [], error: "リクエストが多すぎます。しばらくしてから再試行してください" },
        { status: 429 }
      );
    }

    if (!response.ok) {
      throw new Error(`Wikidata SPARQL error: ${response.status}`);
    }

    const data = (await response.json()) as SparqlResponse;
    const results = mapResults(data.results?.bindings ?? []);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("映画検索エラー:", error);

    return NextResponse.json(
      { results: [], error: "映画検索に失敗しました" },
      { status: 502 }
    );
  }
}
