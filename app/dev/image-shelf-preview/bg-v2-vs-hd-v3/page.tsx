import { notFound } from "next/navigation";
import BgV2VsHdV3Client from "./BgV2VsHdV3Client";

export const metadata = {
  title: "棚背景 v2 / HD v3 比較 | myshelf",
  robots: { index: false, follow: false },
};

/**
 * 開発専用: 旧試作 v2 と新候補 HD v3 を、作品配置つきでボタン切替比較。
 * 本番ビルドでは 404。配置座標・サイズは変更しない。
 */
export default function BgV2VsHdV3Page() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <BgV2VsHdV3Client />;
}
