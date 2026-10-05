"use client";

import React, { useEffect, useState } from "react";
import { readGuestShelf, removeGuestWork, GuestWork } from "@/lib/guest-shelf";
import CatalogSearchSection from "@/components/catalog-search-section";

export default function WorksHome() {
  const [works, setWorks] = useState<GuestWork[]>([]);

  const loadShelf = () => {
    setWorks(readGuestShelf());
  };

  useEffect(() => {
    loadShelf();
    window.addEventListener("myshelf_guest_shelf_updated", loadShelf);
    return () => {
      window.removeEventListener("myshelf_guest_shelf_updated", loadShelf);
    };
  }, []);

  const handleRemove = (idOrTitle: string) => {
    removeGuestWork(idOrTitle);
    // 削除した後に最新の仮棚データを再度読み込んでセットする
    const updatedWorks = readGuestShelf();
    setWorks(updatedWorks);
  
  };

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-8">
      {/* 検索・追加エリア */}
      <CatalogSearchSection onAdded={loadShelf} />

      {/* あなたの本棚エリア */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">あなたの本棚</h2>
        {works.length === 0 ? (
          <p className="text-sm text-muted-foreground">棚に作品がありません。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {works.map((work) => {
              const displayImage = work?.imageUrl || work?.image_url;
              return (
                <div
                  key={work.id || work.title}
                  className="flex flex-row bg-card text-card-foreground rounded-lg border shadow-sm overflow-hidden w-full my-2"
                >
                  {/* 左側：画像枠 */}
                  <div className="w-28 sm:w-32 bg-muted flex items-center justify-center shrink-0 border-r min-h-[120px]">
                    {displayImage ? (
                      <img
                        src={displayImage}
                        alt={work?.title || "作品画像"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground p-2 text-center font-medium">
                        No Image
                      </span>
                    )}
                  </div>

                  {/* 右側：情報と削除ボタン */}
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">🎬 映画</div>
                      <h3 className="font-bold text-sm line-clamp-1">{work?.title}</h3>
                      {work?.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {work.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-3">
                      <button
                        onClick={() => handleRemove(work.id || work.title)}
                        className="w-full py-1.5 bg-destructive text-destructive-foreground text-xs rounded hover:opacity-90 transition-opacity text-center font-medium"
                      >
                        棚から外す
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}