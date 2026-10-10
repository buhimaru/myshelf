import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";

export const metadata = {
  title: "使い方 | myshelf",
  description: "myshelfの基本的な使い方",
};

export default function HowToPage() {
  return (
    <div className="lp">
      <SiteHeader active="howto" />
      <main className="lp-simple">
        <h1>使い方</h1>
        <ol className="lp-steps">
          <li>
            <h2>アカウントを用意する</h2>
            <p>
              「はじめる」から新規登録するか、ゲストとしてはじめられます。すでに登録済みの方はログインしてください。
            </p>
          </li>
          <li>
            <h2>作品を検索して追加する</h2>
            <p>
              本・映画・音楽などの検索から作品を選び、自分の棚へ追加できます。
            </p>
          </li>
          <li>
            <h2>棚を整える</h2>
            <p>
              追加した作品は編集や削除ができます。ジャンルをまたいで、ひとつの棚に並べられます。
            </p>
          </li>
        </ol>
        <p className="lp-simple-note">
          公開・非公開や他のユーザーの棚を見る機能は、現時点ではまだ利用できません。
        </p>
        <Link href="/?auth=start" className="lp-btn-primary">
          今すぐはじめる
        </Link>
      </main>
    </div>
  );
}
