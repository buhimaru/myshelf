import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";

export const metadata = {
  title: "myshelfについて | myshelf",
  description: "myshelfは、好きな作品をひとつの棚に残すサービスです。",
};

export default function AboutPage() {
  return (
    <div className="lp">
      <SiteHeader active="about" />
      <main className="lp-simple">
        <h1>myshelfについて</h1>
        <p>
          myshelfは、本・映画・音楽・漫画など、ジャンルを超えて好きな作品をひとつの棚に残すためのサービスです。
        </p>
        <p>
          忘れかけていた作品も、いま心に残っている作品も、自分だけのコレクションとして並べられます。
        </p>
        <p className="lp-closing-message">好きな作品と、ずっとそばに。</p>
        <Link href="/?auth=start" className="lp-btn-primary">
          今すぐはじめる
        </Link>
      </main>
    </div>
  );
}