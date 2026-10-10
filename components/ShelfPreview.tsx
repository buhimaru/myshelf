const PREVIEW_JACKETS = [
  {
    id: "book-1",
    kind: "book",
    title: "午後の書架",
    meta: "短編集",
  },
  {
    id: "movie-1",
    kind: "movie",
    title: "SILENT PIER",
    meta: "Film",
  },
  {
    id: "music-1",
    kind: "music",
    title: "BLUE HOUR",
    meta: "Album",
  },
  {
    id: "manga-1",
    kind: "manga",
    title: "屋上通信",
    meta: "Comic",
  },
  {
    id: "book-2",
    kind: "book",
    title: "North Window",
    meta: "Essay",
  },
  {
    id: "movie-2",
    kind: "movie",
    title: "街灯の先で",
    meta: "Cinema",
  },
  {
    id: "music-2",
    kind: "music",
    title: "紙飛行機",
    meta: "EP",
  },
  {
    id: "manga-2",
    kind: "manga",
    title: "小さな航海",
    meta: "Vol.1",
  },
] as const;

function JacketArt({ kind }: { kind: (typeof PREVIEW_JACKETS)[number]["kind"] }) {
  if (kind === "book") {
    return (
      <svg className="lp-jacket-art" viewBox="0 0 80 120" aria-hidden="true">
        <rect x="8" y="14" width="3" height="92" fill="currentColor" opacity="0.25" />
        <path
          d="M22 28h40M22 40h28M22 52h34"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.35"
        />
        <circle cx="54" cy="86" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      </svg>
    );
  }

  if (kind === "movie") {
    return (
      <svg className="lp-jacket-art" viewBox="0 0 80 120" aria-hidden="true">
        <rect x="14" y="22" width="52" height="34" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <path d="M14 78h52M24 88h32M32 98h16" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <polygon points="34,30 34,48 50,39" fill="currentColor" opacity="0.28" />
      </svg>
    );
  }

  if (kind === "music") {
    return (
      <svg className="lp-jacket-art" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="54" r="22" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.35" />
        <circle cx="50" cy="54" r="6" fill="currentColor" opacity="0.28" />
        <path
          d="M68 28v34c0 6-4 10-9 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.4"
        />
      </svg>
    );
  }

  return (
    <svg className="lp-jacket-art" viewBox="0 0 80 120" aria-hidden="true">
      <rect x="16" y="20" width="48" height="64" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <path d="M24 36h32M24 48h24M24 60h28" stroke="currentColor" strokeWidth="2" opacity="0.28" />
      <circle cx="52" cy="72" r="5" fill="currentColor" opacity="0.22" />
    </svg>
  );
}

export default function ShelfPreview() {
  return (
    <div className="lp-preview">
      <p className="lp-preview-label">棚のイメージ</p>
      <div className="lp-preview-shelf" aria-hidden="true">
        {PREVIEW_JACKETS.map((item) => (
          <article
            key={item.id}
            className={`lp-jacket lp-jacket--${item.kind}`}
          >
            <div className="lp-jacket-face">
              <JacketArt kind={item.kind} />
              <div className="lp-jacket-copy">
                <p className="lp-jacket-title">{item.title}</p>
                <p className="lp-jacket-meta">{item.meta}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="lp-preview-note">※イメージです。実際の作品ジャケットではありません。</p>
    </div>
  );
}
