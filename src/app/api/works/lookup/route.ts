import { NextRequest } from "next/server";

import {
  lookupExternalMedia,
  MEDIA_LOOKUP_NOT_FOUND,
  parseLookupCategory,
} from "@/lib/external-media";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title")?.trim() ?? "";
  const category = parseLookupCategory(
    request.nextUrl.searchParams.get("category"),
  );

  if (!title) {
    return Response.json(
      { error: "タイトルを入力してください。", items: [] },
      { status: 400 },
    );
  }

  if (!category) {
    return Response.json(
      { error: MEDIA_LOOKUP_NOT_FOUND, items: [] },
      { status: 400 },
    );
  }

  try {
    const result = await lookupExternalMedia(title, category);
    return Response.json(
      {
        items: result.items,
        error: result.items.length > 0 ? null : (result.error ?? MEDIA_LOOKUP_NOT_FOUND),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[MyShelf] /api/works/lookup failed", error);
    return Response.json(
      { error: MEDIA_LOOKUP_NOT_FOUND, items: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
