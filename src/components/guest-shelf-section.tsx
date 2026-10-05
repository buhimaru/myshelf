"use client";

import React from "react";
import { readGuestShelf, type Guestwork } from "@/lib/guest-shelf";

interface GuestShelfSectionProps {
  works: Guestwork[];
  onDeleted?: () => void;
  onEdit?: (work: Guestwork) => void;
}

export default function GuestShelfSection({ works, onDeleted, onEdit }: GuestShelfSectionProps) {
  if (!works || works.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-3 my-4">
      <h2 className="text-lg font-bold px-1">仮棚 (ゲスト) の作品</h2>
      <div className="grid grid-cols-1 gap-3">
        {works.map((work) => {
          // デバッグ用：画像URLの中身を確認
          console.log(`Work ID: ${work.id}, Title: ${work.title}`);
          console.log(`  imageUrl: ${work.imageUrl}`);
          console.log(`  image_url: ${work.image_url}`);

          // 画像URLの取得（image_url や imageUrl に対応）
          const posterUrl = work.imageUrl || work.image_url;

          return (
            <div
              key={work.id}
              className="flex flex-row items-stretch bg-card text-card-foreground rounded-lg border shadow-sm overflow-hidden w-full"
              style={{ border: '2px solid red' }} // ★デバッグ用：枠を強制的に赤くする
            >
              {/* 左側：ポスター画像 */}
              <div className="w-28 sm:w-32 bg-muted flex items-center justify-center shrink-0 border-r min-h-[110px]">
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={work.title || "作品画像"}
                    className="w-full h-full object-cover"
                    // ★デバッグ用：画像読み込みエラー時にログを出す
                    onError={(e) => console.error(`Failed to load image: ${posterUrl}`, e)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground p-2 text-center font-medium">
                    No Image<br/>
                    {/* ★デバッグ用：URLが空であることを表示 */}
                    (URL: {posterUrl ? "あり" : "なし"})
                  </span>
                )}
              </div>

          

              {/* 右側：タイトル・説明文・削除ボタン */}
              <div className="flex-1 p-3 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">作品</div>
                  <h3 className="font-bold text-sm line-clamp-1">{work.title}</h3>
                  {work.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {work.description}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex justify-end">
                  {/* 必要に応じてボタンやアクションを記述 */}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}