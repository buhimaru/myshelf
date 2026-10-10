export type MediaType =
  | "book"
  | "manga"
  | "movie"
  | "music"
  | "game"
  | "anime"
  | "drama";

export type MediaItem = {
  id: string;
  type: MediaType;
  title: string;
  creator?: string | null;
  imageUrl?: string;
  createdAt?: string;
};
