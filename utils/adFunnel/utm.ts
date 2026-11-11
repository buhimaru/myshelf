const UTM_RE = /^[a-z0-9_]{1,64}$/;

export type ParsedUtm = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
};

/** UTM 値を正規化・検証。不正なら null */
export function normalizeUtmValue(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!UTM_RE.test(value)) return null;
  return value;
}

export function parseUtmFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null }
): ParsedUtm | null {
  const utmSource = normalizeUtmValue(params.get("utm_source"));
  const utmMedium = normalizeUtmValue(params.get("utm_medium"));
  const utmCampaign = normalizeUtmValue(params.get("utm_campaign"));
  if (!utmSource || !utmMedium || !utmCampaign) return null;
  return { utmSource, utmMedium, utmCampaign };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
