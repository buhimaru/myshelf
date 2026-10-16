import type { MediaItem, MediaType } from "../../../types/media";

type Draft = {
  id: string;
  type: MediaType;
  title: string;
  creator: string;
};

/**
 * デザイン確認用の仮作品。棚には保存しない。
 * 音楽IDは、既存の背表紙判定で CD と LP が両方出るものだけを選んでいる。
 * 並びはジャンルをまとめず、入り乱れるように固定している。
 */
const DRAFTS: Draft[] = [
  { id: "spine-preview-book-1", type: "book", title: "夏の図書室", creator: "青木 蓮" },
  { id: "spine-preview-music-2", type: "music", title: "真夜中の回転", creator: "南 静" },
  { id: "spine-preview-game-1", type: "game", title: "港の灯台", creator: "灯台スタジオ" },
  { id: "spine-preview-manga-1", type: "manga", title: "青の廊下", creator: "黒川 芽" },
  { id: "spine-preview-movie-1", type: "movie", title: "雨の終点", creator: "森下 映" },
  { id: "spine-preview-music-0", type: "music", title: "窓辺", creator: "小峰 律" },
  { id: "spine-preview-manga-2", type: "manga", title: "紙飛行機", creator: "白井 空" },
  { id: "spine-preview-movie-2", type: "movie", title: "静かな惑星", creator: "遠藤 航" },
  { id: "spine-preview-book-2", type: "book", title: "余白", creator: "今井 文" },
  { id: "spine-preview-game-2", type: "game", title: "森の駅", creator: "駅前ゲームズ" },
  { id: "spine-preview-music-4", type: "music", title: "午後の針", creator: "針谷 奏" },
  { id: "spine-preview-movie-3", type: "movie", title: "最後の列車", creator: "川瀬 直" },
  {
    id: "spine-preview-book-3",
    type: "book",
    title: "背表紙からはみ出さないことを確かめるためのとても長い題名",
    creator: "長田 頁",
  },
  { id: "spine-preview-manga-3", type: "manga", title: "屋上の猫", creator: "猫田 三" },
  { id: "spine-preview-music-1", type: "music", title: "小さな部屋", creator: "部屋 小鳥" },
  { id: "spine-preview-game-3", type: "game", title: "砂時計", creator: "砂丘ソフト" },
  { id: "spine-preview-manga-4", type: "manga", title: "夜行列車", creator: "夜行 編集室" },
  { id: "spine-preview-book-4", type: "book", title: "海辺の手紙", creator: "浜田 栞" },
  { id: "spine-preview-movie-4", type: "movie", title: "白い部屋", creator: "白雪 監督" },
  { id: "spine-preview-music-3", type: "music", title: "遠い街", creator: "街角バンド" },
  { id: "spine-preview-game-4", type: "game", title: "星の図書館", creator: "星図工房" },
  {
    id: "spine-preview-manga-5",
    type: "manga",
    title: "縦書きでどこまで読めるかを見る長い漫画の題名",
    creator: "縦書 漫画部",
  },
  {
    id: "spine-preview-music-7",
    type: "music",
    title: "横書きでも行内に収まる長いアルバムの名前",
    creator: "横書きレコード",
  },
  { id: "spine-preview-book-5", type: "book", title: "未読のページ", creator: "未読 舎" },
  { id: "spine-preview-movie-5", type: "movie", title: "冬の訪問者", creator: "冬木 映" },
  { id: "spine-preview-game-5", type: "game", title: "時計台", creator: "時計ゲーム" },
  { id: "spine-preview-manga-6", type: "manga", title: "透明な街", creator: "透明社" },
  { id: "spine-preview-game-6", type: "game", title: "古い鍵", creator: "鍵屋ソフト" },
  { id: "spine-preview-book-6", type: "book", title: "棚の奥", creator: "奥田 書" },
  { id: "spine-preview-movie-6", type: "movie", title: "夕暮れの扉", creator: "夕暮 映像" },
];

export const SPINE_PREVIEW_ITEMS: MediaItem[] = DRAFTS.map((item) => ({
  id: item.id,
  type: item.type,
  title: item.title,
  creator: item.creator,
  description: null,
}));
