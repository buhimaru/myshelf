import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";

export const metadata = {
  title: "お問い合わせ | myshelf",
  description: "myshelfへのお問い合わせ先です。",
};

export default function ContactPage() {
  return (
    <div className="lp">
      <SiteHeader />
      <main className="lp-simple lp-legal">
        <h1>お問い合わせ</h1>
        <p>
          作品の表紙・ジャケット・ポスター等の掲載について、権利者の方から掲載停止・削除のご要望がございましたら、こちらからお問い合わせください。
        </p>
        <p>
          myshelfに関するご質問、不具合のご報告、作品情報・画像に関するお問い合わせなどは、以下のメールアドレスまでご連絡ください。
        </p>
        <p className="lp-contact-email">
          <a href="mailto:contact.myshelf@gmail.com">
            contact.myshelf@gmail.com
          </a>
        </p>
        <p>お問い合わせの内容を確認のうえ、必要に応じて返信いたします。</p>
        <ul className="lp-contact-notes">
          <li>ご返信までにお時間をいただく場合があります。</li>
          <li>パスワードなどの認証情報は送信しないでください。</li>
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
