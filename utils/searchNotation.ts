/**
 * 作品検索の表記ゆれ共通処理。
 * 中黒・空白・英数字全半角などを揃えて照合・再試行クエリを作る。
 */

const SEPARATOR_CLASS = "[\u30FB\uFF65\u00B7\u2022\u2219\\-–—]";
const SEPARATOR_RE = new RegExp(SEPARATOR_CLASS, "g");
const COMPACT_STRIP_RE = new RegExp(
  `${SEPARATOR_CLASS}|['’ʼ]`,
  "g"
);
/** 区切り無しカタカナ題名向け。長い接続語を先に試す */
const LOANWORD_CONNECTORS = [
  "オブザ",
  "インザ",
  "アンド",
  "ヴァーサス",
  "バーサス",
  "オブ",
  "フォー",
  "フロム",
  "イン",
  "オン",
  "トゥ",
  "ザ",
] as const;

/** 大小・全半角・中黒・空白・アポストロフィ等を無視した照合キー */
export function compactTitleKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(COMPACT_STRIP_RE, "")
    .replace(/\s+/g, "")
    .trim();
}

/** NFKC ＋ 連続空白畳み */
export function baselineSearchText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * 0件時の再試行クエリ。中黒類を空白に揃え、空白を畳む。
 * 原文と同じなら null。
 */
export function buildSoftSeparatorQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const softened = trimmed
    .normalize("NFKC")
    .replace(SEPARATOR_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!softened) return null;
  if (softened === baselineSearchText(trimmed)) return null;
  return softened;
}

/**
 * 区切りをすべて除いた再試行クエリ（MusicBrainz のフレーズ一致向けなど）。
 * 原文（整形後）と同じなら null。
 */
export function buildCompactSearchQuery(raw: string): string | null {
  const cleaned = baselineSearchText(raw);
  if (!cleaned) return null;
  const compact = compactTitleKey(cleaned);
  if (!compact || compact === cleaned) return null;
  // compact は小文字化済み。API には見た目を壊しすぎないよう、区切り除去のみの形を返す
  const stripped = cleaned
    .normalize("NFKC")
    .replace(SEPARATOR_RE, "")
    .replace(/\s+/g, "")
    .trim();
  if (!stripped || stripped === cleaned) return null;
  return stripped;
}

/**
 * 区切り無しクエリが外部APIで 0 件のときの候補取得用プレフィックス。
 * 中黒位置の推測はせず、先頭数文字だけ送って厳密照合する前提。
 */
export function buildCandidatePrefixQuery(raw: string): string | null {
  const compact = compactTitleKey(raw);
  const chars = [...compact];
  if (chars.length < 6) return null;
  const prefix = chars.slice(0, 4).join("");
  if (!prefix || prefix === compact) return null;
  return prefix;
}

/**
 * 区切りをすべて除いた入力に対し、カタカナ外来語の接続語の前後へ空白を入れる。
 * 例: ゲームオブスローンズ → ゲーム オブ スローンズ
 * 既に空白・中黒・ハイフンがある場合は null（原文優先）。
 */
export function buildLoanwordSpacedQuery(raw: string): string | null {
  const cleaned = baselineSearchText(raw);
  if (!cleaned) return null;
  if (/[\s\u30FB\uFF65\u00B7\u2022\u2219\-–—]/.test(cleaned)) return null;

  let result = cleaned;
  for (const connector of LOANWORD_CONNECTORS) {
    if (connector === "オブザ") {
      result = result.replace(/(\S)オブザ(\S)/gi, "$1 オブ ザ $2");
      continue;
    }
    if (connector === "インザ") {
      result = result.replace(/(\S)インザ(\S)/gi, "$1 イン ザ $2");
      continue;
    }
    const re = new RegExp(`(\\S)(${connector})(\\S)`, "gi");
    result = result.replace(re, "$1 $2 $3");
  }
  result = result.replace(/\s+/g, " ").trim();
  if (!result || result === cleaned) return null;
  return result;
}

/**
 * 0件時の再試行クエリを重複なしで最大 max 件。
 * 順: soft（中黒→空白）→ loanword 空白挿入 → compact（区切り除去）
 */
export function buildNotationRetryQueries(
  raw: string,
  max = 2
): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const baseline = baselineSearchText(trimmed);
  const seen = new Set<string>([trimmed, baseline].filter(Boolean));
  const out: string[] = [];
  for (const variant of [
    buildSoftSeparatorQuery(trimmed),
    buildLoanwordSpacedQuery(trimmed),
    buildCompactSearchQuery(trimmed),
  ]) {
    if (!variant || seen.has(variant)) continue;
    seen.add(variant);
    out.push(variant);
    if (out.length >= max) break;
  }
  return out;
}

export function titlesMatchCompact(
  candidateTitle: string,
  query: string
): boolean {
  const want = compactTitleKey(query);
  if (!want) return false;
  return compactTitleKey(candidateTitle) === want;
}

export function anyTitleMatchesCompact(
  titles: Array<string | null | undefined>,
  query: string
): boolean {
  const want = compactTitleKey(query);
  if (!want) return false;
  return titles.some((title) => {
    if (!title) return false;
    return compactTitleKey(title) === want;
  });
}
