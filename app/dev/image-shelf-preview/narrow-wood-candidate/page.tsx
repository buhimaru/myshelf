import { notFound } from "next/navigation";
import NarrowWoodCandidateClient from "./NarrowWoodCandidateClient";

export const metadata = {
  title: "棚背景候補 A/B/C 比較 | myshelf",
  robots: { index: false, follow: false },
};

/**
 * 開発専用: 暫定採用(A)・狭い木目候補(B)・温もり木製候補(C)を同作品・同 ImageShelf で切替比較。
 * 本番ビルドでは 404。A/B の背景・配置は変更しない。
 */
export default function NarrowWoodCandidatePage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <NarrowWoodCandidateClient />;
}
