import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdFunnelEventName } from "../../../utils/adFunnel/constants";
import { allowAdFunnelRequest } from "../../../utils/adFunnel/rateLimit";
import { isUuid, normalizeUtmValue } from "../../../utils/adFunnel/utm";

export const runtime = "nodejs";

type Body = {
  eventName?: unknown;
  visitorId?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
};

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventName =
    typeof body.eventName === "string" ? body.eventName.trim().toLowerCase() : "";
  const visitorId =
    typeof body.visitorId === "string" ? body.visitorId.trim() : "";
  const utmSource = normalizeUtmValue(
    typeof body.utmSource === "string" ? body.utmSource : null
  );
  const utmMedium = normalizeUtmValue(
    typeof body.utmMedium === "string" ? body.utmMedium : null
  );
  const utmCampaign = normalizeUtmValue(
    typeof body.utmCampaign === "string" ? body.utmCampaign : null
  );

  if (!isAdFunnelEventName(eventName)) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }
  if (!isUuid(visitorId)) {
    return NextResponse.json({ ok: false, error: "invalid_visitor" }, { status: 400 });
  }
  if (!utmSource || !utmMedium || !utmCampaign) {
    return NextResponse.json({ ok: false, error: "invalid_utm" }, { status: 400 });
  }

  const ip = clientIp(request);
  if (!allowAdFunnelRequest(`${visitorId}:${ip}:${eventName}`)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "misconfigured" }, { status: 503 });
  }

  const rawAuth = request.headers.get("authorization");
  const bearer =
    rawAuth && /^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i.test(rawAuth.trim())
      ? rawAuth.trim()
      : null;

  // コンバージョンは API 層でも JWT 必須（RPC 側でも再検証）
  if (eventName !== "visit" && !bearer) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  const supabase = createClient(url, key, {
    global: bearer ? { headers: { Authorization: bearer } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.rpc("record_ad_funnel_event", {
      p_visitor_id: visitorId,
      p_event_name: eventName,
      p_utm_source: utmSource,
      p_utm_medium: utmMedium,
      p_utm_campaign: utmCampaign,
    });

    if (error) {
      // マイグレーション未適用時など。本機能は止めない
      console.warn("ad-funnel rpc error:", error.message);
      return NextResponse.json(
        { ok: false, error: "rpc_failed" },
        { status: 503 }
      );
    }

    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    console.warn("ad-funnel unexpected error:", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
