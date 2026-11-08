import { tmdbGet } from "./client";

/** API／UI用。DBには creator 文字列のみ保存する */
export type TmdbCreditRole = "director" | "creator" | "studio";

export type TmdbCreditInfo = {
  /** 保存用文字列（空なら未取得） */
  creator: string;
  role: TmdbCreditRole | "";
  /** 検索UI表示用の短い役割名 */
  roleLabel: string;
};

type CrewMember = {
  job?: string;
  name?: string;
};

type CreditsResponse = {
  crew?: CrewMember[];
};

type NamedEntity = {
  name?: string;
};

const COMPANY_STORAGE_PREFIX = "制作:";

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function joinNames(names: string[]): string {
  return uniqueNames(names).join("、");
}

export function roleLabelFor(role: TmdbCreditRole | ""): string {
  if (role === "director") return "監督";
  if (role === "creator") return "企画";
  // production_companies は制作スタジオと断定できない
  if (role === "studio") return "関連制作会社";
  return "";
}

/** 人物名はそのまま、制作会社は「制作:」接頭辞で役割を残す（スキーマ追加なし） */
export function encodeTmdbCredit(
  role: TmdbCreditRole,
  names: string[]
): TmdbCreditInfo {
  const joined = joinNames(names);
  if (!joined) {
    return { creator: "", role: "", roleLabel: "" };
  }
  if (role === "studio") {
    return {
      creator: `${COMPANY_STORAGE_PREFIX}${joined}`,
      role: "studio",
      roleLabel: roleLabelFor("studio"),
    };
  }
  return {
    creator: joined,
    role,
    roleLabel: roleLabelFor(role),
  };
}

export function emptyTmdbCredit(): TmdbCreditInfo {
  return { creator: "", role: "", roleLabel: "" };
}

/** movie credits から Director のみ抽出。なければ空 */
export async function fetchMovieDirectorCredit(
  tmdbId: number
): Promise<TmdbCreditInfo> {
  const result = await tmdbGet<CreditsResponse>(`movie/${tmdbId}/credits`, {
    language: "ja-JP",
  });
  if (!result.ok) {
    return emptyTmdbCredit();
  }
  const crew = Array.isArray(result.data.crew) ? result.data.crew : [];
  const directors = crew
    .filter((row) => (row.job || "").trim() === "Director")
    .map((row) => (typeof row.name === "string" ? row.name : ""))
    .filter(Boolean);
  return encodeTmdbCredit("director", directors);
}

/**
 * TV: created_by（企画者）を優先。
 * anime で空のときのみ production_companies を制作として使う。
 * ドラマでは制作会社を人物の代替にしない。
 */
export function resolveTvCredit(params: {
  shelfKind: "anime" | "drama";
  createdBy?: NamedEntity[] | null;
  productionCompanies?: NamedEntity[] | null;
}): TmdbCreditInfo {
  const creators = uniqueNames(
    (params.createdBy ?? []).map((row) =>
      typeof row.name === "string" ? row.name : ""
    )
  );
  if (creators.length > 0) {
    return encodeTmdbCredit("creator", creators);
  }

  if (params.shelfKind !== "anime") {
    return emptyTmdbCredit();
  }

  const companies = uniqueNames(
    (params.productionCompanies ?? []).map((row) =>
      typeof row.name === "string" ? row.name : ""
    )
  );
  // 配給などを含む長い一覧になりやすいので、先頭のみ採用（未登録会社は作らない）
  if (companies.length > 0) {
    return encodeTmdbCredit("studio", companies.slice(0, 3));
  }
  return emptyTmdbCredit();
}

/** 保存済み creator から表示用の役割と本文を復元 */
export function parseStoredCreatorCredit(
  creator: string | null | undefined,
  mediaType: string
): { roleLabel: string; text: string } | null {
  const raw = (creator ?? "").trim();
  if (!raw) return null;

  // 既存保存の「制作:」接頭辞も関連制作会社として扱う（データは書き換えない）
  if (raw.startsWith(COMPANY_STORAGE_PREFIX)) {
    const text = raw.slice(COMPANY_STORAGE_PREFIX.length).trim();
    if (!text) return null;
    return { roleLabel: "関連制作会社", text };
  }

  if (mediaType === "movie") return { roleLabel: "監督", text: raw };
  if (mediaType === "anime" || mediaType === "drama") {
    return { roleLabel: "企画", text: raw };
  }
  if (mediaType === "book") return { roleLabel: "著者", text: raw };
  if (mediaType === "manga") return { roleLabel: "作者", text: raw };
  if (mediaType === "music") return { roleLabel: "アーティスト", text: raw };
  if (mediaType === "game") return { roleLabel: "開発元", text: raw };
  return { roleLabel: "", text: raw };
}

export function formatCreatorWithRole(
  roleLabel: string,
  text: string
): string {
  const name = text.trim();
  if (!name) return "";
  const role = roleLabel.trim();
  return role ? `${role}：${name}` : name;
}

/**
 * 棚カードの aria-label 用。creator が空なら作者不明などを付けない。
 * 役割名は保存値から復元し、誤って「作者」と読まない。
 */
export function shelfItemAriaLabel(params: {
  title: string;
  creator?: string | null;
  type: string;
  genreLabel: string;
}): string {
  const title = params.title.trim() || "作品";
  const genre = params.genreLabel.trim() || params.type;
  const parsed = parseStoredCreatorCredit(params.creator, params.type);
  const credit = parsed
    ? formatCreatorWithRole(parsed.roleLabel, parsed.text)
    : "";
  if (credit) {
    return `${title}、${credit}、${genre}。作品詳細を開く`;
  }
  return `${title}、${genre}。作品詳細を開く`;
}
