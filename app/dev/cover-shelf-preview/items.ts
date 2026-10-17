import { SPINE_PREVIEW_ITEMS } from "../spine-preview/items";

// 既存の検索APIが返した画像URLだけを使う。URLは作らない。
// 題名は背表紙プレビューの仮作品のままで、画像そのものの題名ではない。
// 映画の Wikimedia 画像は横長の題字なので、縦長の表紙には使わない。
const SAMPLE_IMAGE_URLS: Record<string, string> = {
  "spine-preview-book-1": "https://covers.openlibrary.org/b/id/11525458-M.jpg",
  "spine-preview-book-4": "https://covers.openlibrary.org/b/id/13060297-M.jpg",
  "spine-preview-manga-1":
    "https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/5788/9784088805788.jpg?_ex=200x200",
  "spine-preview-manga-3":
    "https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/6301/9784088826301.jpg?_ex=200x200",
  "spine-preview-game-1":
    "https://images.igdb.com/igdb/image/upload/t_cover_big/coc51c.jpg",
  "spine-preview-game-2":
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co5wdi.jpg",
  "spine-preview-game-4":
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co5vr3.jpg",
  "spine-preview-music-0":
    "https://coverartarchive.org/release-group/9162580e-5df4-32de-80cc-f45a8d8a9b1d/front-250",
  "spine-preview-music-2":
    "https://coverartarchive.org/release-group/284326a7-edbb-4b9b-82cf-dc53863759ef/front-250",
};

export const COVER_SHELF_PREVIEW_ITEMS = SPINE_PREVIEW_ITEMS.map((item) => ({
  ...item,
  imageUrl: SAMPLE_IMAGE_URLS[item.id],
}));

// 比較用。IDと種別は現状と同じなので、大きさ・順序・段組みは変わらない。
// 題名と作者は、割り当てた表紙の作品に合わせている。画像のない5件は仮作品のまま。
// 出典は既存の検索API（Open Library、楽天ブックス、IGDB、MusicBrainz、Wikidata）が返したURL。
const RICH_WORKS: Record<string, { title: string; creator: string; imageUrl: string }> = {
  "spine-preview-book-1": {
    title: "ノルウェイの森 (下)",
    creator: "村上春樹",
    imageUrl: "https://covers.openlibrary.org/b/id/11525458-M.jpg",
  },
  "spine-preview-book-2": {
    title: "Kafka en la orilla",
    creator: "村上春樹",
    imageUrl: "https://covers.openlibrary.org/b/id/4982600-M.jpg",
  },
  "spine-preview-book-4": {
    title: "Norwegian Wood",
    creator: "村上春樹",
    imageUrl: "https://covers.openlibrary.org/b/id/13060297-M.jpg",
  },
  "spine-preview-book-5": {
    title: "The Housekeeper and the Professor",
    creator: "小川洋子",
    imageUrl: "https://covers.openlibrary.org/b/id/6609000-M.jpg",
  },
  "spine-preview-book-6": {
    title: "火花",
    creator: "又吉直樹",
    imageUrl: "https://covers.openlibrary.org/b/id/13076469-M.jpg",
  },
  "spine-preview-manga-1": {
    title: "ONE PIECE",
    creator: "尾田栄一郎",
    imageUrl:
      "https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/5788/9784088805788.jpg?_ex=200x200",
  },
  "spine-preview-manga-2": {
    title: "鬼滅の刃",
    creator: "吾峠呼世晴",
    imageUrl:
      "https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/7232/9784088807232.jpg?_ex=200x200",
  },
  "spine-preview-manga-3": {
    title: "Fullmetal Alchemist",
    creator: "荒川弘",
    imageUrl: "https://covers.openlibrary.org/b/id/863658-M.jpg",
  },
  "spine-preview-manga-4": {
    title: "SLAM DUNK",
    creator: "井上雄彦",
    imageUrl:
      "https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/8453/9784088718453_1_4.jpg?_ex=200x200",
  },
  "spine-preview-manga-6": {
    title: "チェンソーマン",
    creator: "藤本タツキ",
    imageUrl:
      "https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/7804/9784088817804_1_2.jpg?_ex=200x200",
  },
  "spine-preview-movie-1": {
    title: "ローマの休日",
    creator: "ウィリアム・ワイラー",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Roman%20Holiday%20%281953%20poster%29.jpg?width=300",
  },
  "spine-preview-movie-2": {
    title: "カサブランカ",
    creator: "マイケル・カーティス",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/CasablancaPoster-Gold.jpg?width=300",
  },
  "spine-preview-movie-3": {
    title: "七人の侍",
    creator: "黒澤明",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Seven%20Samurai%20poster2.jpg?width=300",
  },
  "spine-preview-movie-4": {
    title: "ジョーズ",
    creator: "スティーヴン・スピルバーグ",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Jaws%20movie%20poster.png?width=300",
  },
  "spine-preview-music-0": {
    title: "Abbey Road",
    creator: "The Beatles",
    imageUrl:
      "https://coverartarchive.org/release-group/9162580e-5df4-32de-80cc-f45a8d8a9b1d/front-250",
  },
  "spine-preview-music-1": {
    title: "Kind of Blue",
    creator: "Miles Davis",
    imageUrl:
      "https://coverartarchive.org/release-group/8e8a594f-2175-38c7-a871-abb68ec363e7/front-250",
  },
  "spine-preview-music-2": {
    title: "Abbey Road",
    creator: "Diana Herrera",
    imageUrl:
      "https://coverartarchive.org/release-group/284326a7-edbb-4b9b-82cf-dc53863759ef/front-250",
  },
  "spine-preview-music-3": {
    title: "Nevermind",
    creator: "Nirvana",
    imageUrl:
      "https://coverartarchive.org/release-group/1b022e01-4da6-387b-8658-8678046e4cef/front-250",
  },
  "spine-preview-music-4": {
    title: "Thriller",
    creator: "Michael Jackson",
    imageUrl:
      "https://coverartarchive.org/release-group/3a7817b5-22cb-32c3-a31b-2c8309fbf92e/front-250",
  },
  "spine-preview-game-1": {
    title: "ゼルダの伝説 神々のトライフォース",
    creator: "Nintendo",
    imageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/coc51c.jpg",
  },
  "spine-preview-game-2": {
    title: "ゼルダの伝説 夢をみる島DX",
    creator: "Nintendo",
    imageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5wdi.jpg",
  },
  "spine-preview-game-3": {
    title: "ポケットモンスター 赤",
    creator: "Game Freak",
    imageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5pi6.jpg",
  },
  "spine-preview-game-4": {
    title: "ゼルダの伝説 時のオカリナ",
    creator: "Nintendo",
    imageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5vr3.jpg",
  },
  "spine-preview-game-5": {
    title: "ゼルダの伝説 ムジュラの仮面",
    creator: "Nintendo",
    imageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/cob65t.jpg",
  },
  "spine-preview-game-6": {
    title: "ゼルダの伝説 風のタクト",
    creator: "Nintendo",
    imageUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5yai.jpg",
  },
};

export const COVER_SHELF_RICH_ITEMS = SPINE_PREVIEW_ITEMS.map((item) => {
  const rich = RICH_WORKS[item.id];
  if (!rich) return { ...item };
  return { ...item, title: rich.title, creator: rich.creator, imageUrl: rich.imageUrl };
});
