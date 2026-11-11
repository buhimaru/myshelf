export const AD_FUNNEL_STORAGE_KEY = "myshelf-ad-attribution-v1";

/** first-touch の保持目安（30日） */
export const AD_FUNNEL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const AD_FUNNEL_EVENTS = [
  "visit",
  "guest_start",
  "first_item",
  "registered",
] as const;

export type AdFunnelEventName = (typeof AD_FUNNEL_EVENTS)[number];

export type AdAttribution = {
  visitorId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  firstTouchedAt: number;
};

export function isAdFunnelEventName(value: string): value is AdFunnelEventName {
  return (AD_FUNNEL_EVENTS as readonly string[]).includes(value);
}
