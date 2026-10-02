import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "本棚",
};

export default function ShelfPage() {
  return (
    <div className="space-y-3">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">本棚</h1>
      <p className="text-muted-foreground">
        あなたの棚と共有された作品が並ぶ予定です。
      </p>
    </div>
  );
}
