export type MediaType =
  | "book"
  | "movie"
  | "music"
  | "anime"
  | "drama";

export type MediaItem = {
  id: string;
  type: MediaType;
  title: string;
  creator?: string;
  imageUrl?: string;
  createdAt?: string;
};