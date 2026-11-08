import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";

export const metadata = {
  title: "使い方 | myshelf",
  description: "myshelfの基本的な使い方",
};

const HOWTO_FEATURES = [
  {
    title: "作品を探す",
    body: "「作品を追加」から、本・映画・音楽・漫画・ゲームなどの作品を検索できます。好きな作品を選んで棚に追加しましょう。",
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="5.25" />
        <path d="m15 15 4.5 4.5" />
      </>
    ),
  },
  {
    title: "自分の棚をつくる",
    body: "ジャンルを超えて、好きだった作品や忘れられない作品をひとつの棚に並べられます。作品は少しずつ増やしていけます。",
    icon: (
      <>
        <rect width="8" height="18" x="3" y="3" rx="1" />
        <path d="M7 3v18" />
        <path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z" />
      </>
    ),
  },
  {
    title: "棚を整理する",
    body: "追加した作品は編集や削除ができます。ページを切り替えたり、ジャンルごとに表示したりして、棚を見やすくできます。",
    icon: (
      <>
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </>
    ),
  },
  {
    title: "棚を公開する",
    body: "棚は公開・非公開を選べます。公開すると、ほかの人にも自分の棚を見てもらえます。",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.25" />
        <path d="M12 3.75v16.5" />
        <path d="M3.75 12h16.5" />
        <path d="M6.2 6.2c2 2.4 2.8 5 2.8 5.8s-.8 3.4-2.8 5.8" />
        <path d="M17.8 6.2c-2 2.4-2.8 5-2.8 5.8s.8 3.4 2.8 5.8" />
      </>
    ),
  },
  {
    title: "人とつながる",
    body: "気になる人をフォローして、その人の棚を眺められます。非公開棚は閲覧の承認が必要です。",
    icon: (
      <>
        <circle cx="8.5" cy="8" r="2.3" />
        <circle cx="15.5" cy="8" r="2.3" />
        <path d="M4.4 18c.55-2.2 2.3-3.4 4.1-3.4s3.55 1.2 4.1 3.4" />
        <path d="M11.4 18c.55-2.2 2.3-3.4 4.1-3.4s3.55 1.2 4.1 3.4" />
      </>
    ),
  },
  {
    title: "棚を探す",
    body: "「棚を探す」から作品名を検索すると、その作品を並べている人の公開棚を見つけられます。",
    icon: (
      <>
        <path d="m8 11 2 2 4-4" />
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
];

export default function HowToPage() {
  return (
    <div className="lp">
      <SiteHeader active="howto" />
      <main className="lp-simple">
        <h1>使い方</h1>
        <p className="lp-howto-lead">
          myshelfでは、好きな作品を集めて自分だけの棚をつくれます。
        </p>

        <ul className="lp-howto-list">
          {HOWTO_FEATURES.map((feature) => (
            <li key={feature.title} className="lp-howto-item">
              <svg
                className="lp-mini-feature-icon lp-howto-item-icon"
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {feature.icon}
              </svg>
              <div className="lp-howto-item-body">
                <h2>{feature.title}</h2>
                <p>{feature.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <section className="lp-howto-start" aria-labelledby="lp-howto-start-title">
          <h2 id="lp-howto-start-title">はじめるには</h2>
          <p>
            「はじめる」から新規登録するか、ゲストとして利用できます。すでに登録している方はログインしてください。
          </p>
          <Link href="/?auth=start" className="lp-btn-primary">
            今すぐはじめる
          </Link>
        </section>
      </main>
    </div>
  );
}
