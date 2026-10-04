import { NextRequest } from "next/server";

import {
  MEDIA_LOOKUP_NOT_FOUND,
  parseLookupCategory,
  searchCatalogByCategory,
} from "@/lib/external-media";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const category = parseLookupCategory(
    request.nextUrl.searchParams.get("category"),
  );

  if (!query) {
    return Response.json(
      { error: "キーワードを入力してください。", items: [] },
      { status: 400 },
    );
  }

  if (!category) {
    return Response.json(
      { error: MEDIA_LOOKUP_NOT_FOUND, items: [] },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await searchCatalogByCategory(query, category);
    return Response.json(
      {
        items: result.items.map((item) => ({
          ...item,
          imageUrl: item.imageUrl,
          image_url: item.imageUrl,
        })),
        error: result.items.length > 0 ? null : (result.error ?? MEDIA_LOOKUP_NOT_FOUND),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[MyShelf] /api/catalog/search failed", error);
    return Response.json(
      { error: MEDIA_LOOKUP_NOT_FOUND, items: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
