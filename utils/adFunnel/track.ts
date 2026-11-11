import type { AdFunnelEventName } from "./constants";
import { readAdAttribution } from "./storage";

type TrackOptions = {
  /** visit は UTM 付きランディング時のみ。他イベントは保存済み attribution が必要 */
  forceVisitAttribution?: {
    visitorId: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
  };
};

/**
 * 広告ファネルイベント送信。失敗しても本機能を止めない。
 */
export function trackAdFunnelEvent(
  eventName: AdFunnelEventName,
  options: TrackOptions = {}
): void {
  if (typeof window === "undefined") return;

  try {
    const attr =
      options.forceVisitAttribution ??
      (() => {
        const stored = readAdAttribution();
        if (!stored) return null;
        return {
          visitorId: stored.visitorId,
          utmSource: stored.utmSource,
          utmMedium: stored.utmMedium,
          utmCampaign: stored.utmCampaign,
        };
      })();

    if (!attr) return;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    void (async () => {
      try {
        // 可能な範囲で JWT を付与（コンバージョン検証用）。失敗しても計測以外に影響させない。
        const { createClient } = await import("../supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        await fetch("/api/ad-funnel", {
          method: "POST",
          headers,
          body: JSON.stringify({
            eventName,
            visitorId: attr.visitorId,
            utmSource: attr.utmSource,
            utmMedium: attr.utmMedium,
            utmCampaign: attr.utmCampaign,
          }),
          keepalive: true,
        });
      } catch {
        // ignore
      }
    })();
  } catch {
    // ignore
  }
}
