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
  /** 棚の持ち主が書いた自由記入欄。未入力は null */
  description?: string | null;
  createdAt?: string;
};
