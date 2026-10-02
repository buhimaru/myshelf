import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "作品",
};

export default function WorksPage() {
  return (
    <div className="space-y-3">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">作品</h1>
      <p className="text-muted-foreground">
        登録した本・映画・アニメ・音楽が一覧表示される予定です。
      </p>
    </div>
  );
}
