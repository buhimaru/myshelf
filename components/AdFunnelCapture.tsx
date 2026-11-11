"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { captureAdAttributionFromUtm } from "../utils/adFunnel/storage";
import { trackAdFunnelEvent } from "../utils/adFunnel/track";
import { parseUtmFromSearchParams } from "../utils/adFunnel/utm";

/**
 * URL の UTM を first-touch 保存し、広告ランディング時のみ visit を送る。
 * 失敗しても画面には影響しない。
 */
export default function AdFunnelCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      const utm = parseUtmFromSearchParams(searchParams);
      if (!utm) return;
      const { attribution } = captureAdAttributionFromUtm(utm);

      // React Strict Mode の二重発火だけ抑止（数秒以内の同一 visitor）
      const debounceKey = `myshelf-ad-visit-debounce:${attribution.visitorId}`;
      try {
        const prev = sessionStorage.getItem(debounceKey);
        if (prev && Date.now() - Number(prev) < 3000) {
          return;
        }
        sessionStorage.setItem(debounceKey, String(Date.now()));
      } catch {
        // ignore
      }

      trackAdFunnelEvent("visit", {
        forceVisitAttribution: {
          visitorId: attribution.visitorId,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
        },
      });
    } catch {
      // ignore
    }
  }, [searchParams]);

  return null;
}
