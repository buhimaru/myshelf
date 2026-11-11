import {
  AD_FUNNEL_STORAGE_KEY,
  AD_FUNNEL_TTL_MS,
  type AdAttribution,
} from "./constants";
import { isUuid, normalizeUtmValue, type ParsedUtm } from "./utm";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function newVisitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // フォールバック（古い環境向け）
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseStored(raw: string): AdAttribution | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AdAttribution>;
    const utmSource = normalizeUtmValue(parsed.utmSource ?? null);
    const utmMedium = normalizeUtmValue(parsed.utmMedium ?? null);
    const utmCampaign = normalizeUtmValue(parsed.utmCampaign ?? null);
    if (
      typeof parsed.visitorId !== "string" ||
      !isUuid(parsed.visitorId) ||
      !utmSource ||
      !utmMedium ||
      !utmCampaign ||
      typeof parsed.firstTouchedAt !== "number" ||
      !Number.isFinite(parsed.firstTouchedAt)
    ) {
      return null;
    }
    return {
      visitorId: parsed.visitorId,
      utmSource,
      utmMedium,
      utmCampaign,
      firstTouchedAt: parsed.firstTouchedAt,
    };
  } catch {
    return null;
  }
}

export function readAdAttribution(): AdAttribution | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(AD_FUNNEL_STORAGE_KEY);
    if (!raw) return null;
    const attr = parseStored(raw);
    if (!attr) {
      localStorage.removeItem(AD_FUNNEL_STORAGE_KEY);
      return null;
    }
    if (Date.now() - attr.firstTouchedAt > AD_FUNNEL_TTL_MS) {
      localStorage.removeItem(AD_FUNNEL_STORAGE_KEY);
      return null;
    }
    return attr;
  } catch {
    return null;
  }
}

function writeAdAttribution(attr: AdAttribution): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(AD_FUNNEL_STORAGE_KEY, JSON.stringify(attr));
  } catch {
    // private mode / quota
  }
}

/**
 * URL の UTM を first-touch で保存。
 * 既存が有効なら上書きしない。新規保存時は true。
 */
export function captureAdAttributionFromUtm(utm: ParsedUtm): {
  attribution: AdAttribution;
  isNewTouch: boolean;
} {
  const existing = readAdAttribution();
  if (existing) {
    return { attribution: existing, isNewTouch: false };
  }
  const attribution: AdAttribution = {
    visitorId: newVisitorId(),
    utmSource: utm.utmSource,
    utmMedium: utm.utmMedium,
    utmCampaign: utm.utmCampaign,
    firstTouchedAt: Date.now(),
  };
  writeAdAttribution(attribution);
  return { attribution, isNewTouch: true };
}
