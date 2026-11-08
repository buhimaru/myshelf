import { tmdbGet, tmdbPosterUrl } from "./client";
import {
  resolveTvCredit,
  type TmdbCreditRole,
} from "./credits";

export type TmdbTvShelfKind = "anime" | "drama";

/** 作品全体または各シーズンの登録候補（既存 items の title/creator/image_url に収まる） */
export type TmdbTvRegisterOption = {
  id: string;
  title: string;
  creator: string;
  type: TmdbTvShelfKind;
  imageUrl: string;
  subtitle: string;
  tmdbId: number;
  media: "tv";
  year: string;
  /** series = 作品全体 / season = 個別シーズン */
  optionKind: "series" | "season";
  seasonNumber: number | null;
  creatorRole?: TmdbCreditRole | "";
  creatorRoleLabel?: string;
};

type TmdbCreatedBy = {
  name?: string;
};

type TmdbCompany = {
  name?: string;
};

type TmdbSeasonSummary = {
  season_number?: number;
  name?: string;
  poster_path?: string | null;
  air_date?: string | null;
  episode_count?: number;
};

type TmdbTvDetail = {
  id?: number;
  name?: string;
  original_name?: string;
  poster_path?: string | null;
  first_air_date?: string;
  created_by?: TmdbCreatedBy[];
  production_companies?: TmdbCompany[];
  seasons?: TmdbSeasonSummary[];
};

function yearFromDate(value: string | null | undefined): string {
  if (!value || value.length < 4) return "";
  const year = value.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function seasonLabel(seasonNumber: number): string {
  if (seasonNumber === 0) return "特別編";
  return `シーズン${seasonNumber}`;
}

function seasonSubtitle(seasonNumber: number, year: string): string {
  const label = seasonNumber === 0 ? "特別編" : `シーズン${seasonNumber}`;
  return [year, "TV", label].filter(Boolean).join(" · ");
}

/**
 * TMDb に存在するシーズンのみ返す。未登録シーズンは生成しない。
 * シーズン0 は特別編として扱い、通常シーズンと分けて並べる。
 */
export async function getTvRegisterOptions(
  tmdbId: number,
  shelfKind: TmdbTvShelfKind,
  fallbacks?: {
    title?: string;
    imageUrl?: string;
    year?: string;
  }
): Promise<{
  creator: string;
  creatorRole: TmdbCreditRole | "";
  creatorRoleLabel: string;
  seriesTitle: string;
  options: TmdbTvRegisterOption[];
}> {
  const result = await tmdbGet<TmdbTvDetail>(`tv/${tmdbId}`, {
    language: "ja-JP",
  });
  if (!result.ok) {
    throw Object.assign(result.error, { status: result.status });
  }

  const detail = result.data;
  const id = typeof detail.id === "number" ? detail.id : tmdbId;
  const seriesTitle = (
    detail.name ||
    detail.original_name ||
    fallbacks?.title ||
    ""
  ).trim();
  if (!seriesTitle) {
    throw Object.assign(new Error("TV series title missing"), { status: 502 });
  }

  const credit = resolveTvCredit({
    shelfKind,
    createdBy: detail.created_by,
    productionCompanies: detail.production_companies,
  });
  const creator = credit.creator;
  const creatorRole = credit.role;
  const creatorRoleLabel = credit.roleLabel;

  const seriesPoster =
    tmdbPosterUrl(detail.poster_path) || (fallbacks?.imageUrl ?? "");
  const seriesYear =
    yearFromDate(detail.first_air_date) || (fallbacks?.year ?? "");

  const seriesOption: TmdbTvRegisterOption = {
    id: `tmdb:tv:${id}:series`,
    title: seriesTitle,
    creator,
    type: shelfKind,
    imageUrl: seriesPoster,
    subtitle: [seriesYear, "TV", "作品全体"].filter(Boolean).join(" · "),
    tmdbId: id,
    media: "tv",
    year: seriesYear,
    optionKind: "series",
    seasonNumber: null,
    creatorRole,
    creatorRoleLabel,
  };

  const seasonRows = Array.isArray(detail.seasons) ? detail.seasons : [];
  const specials: TmdbTvRegisterOption[] = [];
  const regular: TmdbTvRegisterOption[] = [];

  for (const row of seasonRows) {
    const seasonNumber =
      typeof row.season_number === "number" ? row.season_number : null;
    if (seasonNumber === null || !Number.isInteger(seasonNumber)) continue;

    const year = yearFromDate(row.air_date) || seriesYear;
    const poster = tmdbPosterUrl(row.poster_path) || seriesPoster;
    const label = seasonLabel(seasonNumber);
    const option: TmdbTvRegisterOption = {
      id: `tmdb:tv:${id}:season:${seasonNumber}`,
      title: `${seriesTitle} ${label}`,
      creator,
      type: shelfKind,
      imageUrl: poster,
      subtitle: seasonSubtitle(seasonNumber, year),
      tmdbId: id,
      media: "tv",
      year,
      optionKind: "season",
      seasonNumber,
      creatorRole,
      creatorRoleLabel,
    };

    if (seasonNumber === 0) specials.push(option);
    else regular.push(option);
  }

  regular.sort(
    (a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0)
  );

  return {
    creator,
    creatorRole,
    creatorRoleLabel,
    seriesTitle,
    options: [seriesOption, ...regular, ...specials],
  };
}
