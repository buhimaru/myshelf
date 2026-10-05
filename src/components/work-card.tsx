"use client";

import React from "react";

export type WorkCardProps = {
  work: {
    id?: string;
    title?: string;
    description?: string;
    imageUrl?: string | null;
    image_url?: string | null;
    thumbnail?: string | null;
    coverUrl?: string | null;
    [key: string]: any;
  };
  onRemove?: () => void;
  onDeleted?: () => void;
  onEdit?: (work: any) => void;
  onAdded?: () => void;
};

export default function WorkCard({ work, onRemove, onDeleted }: WorkCardProps) {
  const handleRemove = () => {
    if (onRemove) onRemove();
    if (onDeleted) onDeleted();
  };

  const displayImage =
    work?.imageUrl ||
    work?.image_url ||
    work?.thumbnail ||
    work?.coverUrl;

  return (
    <div className="flex flex-row items-stretch bg-card text-card-foreground rounded-lg border shadow-sm overflow-hidden w-full">
      {/* 左側：画像エリア（固定幅） */}
      <div className="w-28 sm:w-32 bg-muted flex items-center justify-center shrink-0 border-r min-h-[110px]">
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

      {/* 右側：タイトル・説明文・削除ボタン */}
      <div className="flex-1 p-3 flex flex-col justify-between">
        <div>
          <div className="text-xs text-muted-foreground mb-1">🎬 作品</div>
          <h3 className="font-bold text-sm line-clamp-1">{work?.title}</h3>
          {work?.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {work.description}
            </p>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleRemove}
            className="px-3 py-1.5 bg-destructive text-destructive-foreground text-xs rounded hover:opacity-90 transition-opacity font-medium"
          >
            棚から外す
          </button>
        </div>
      </div>
    </div>
  );
}