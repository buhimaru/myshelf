"use client";

import React from "react";

export type WorkCardProps = {
  work: any;
  onRemove?: () => void;
  onDeleted?: () => void;
  onEdit?: (work?: any) => void;
};

export function WorkCard({ work, onRemove, onDeleted, onEdit }: WorkCardProps) {
  const handleRemove = () => {
    if (onRemove) onRemove();
    if (onDeleted) onDeleted();
  };

  const displayImage = work?.imageUrl || work?.image_url;

  return (
    <div className="flex bg-card text-card-foreground rounded-lg border shadow-sm overflow-hidden min-h-[140px]">
      {/* 左側：画像エリア（画像がない場合も灰色枠を表示） */}
      <div className="relative w-28 sm:w-36 bg-muted flex-shrink-0 flex items-center justify-center border-r">
        {displayImage ? (
          <img
            src={displayImage}
            alt={work?.title || "作品画像"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-xs text-muted-foreground p-2 text-center">
            No Image
          </div>
        )}
      </div>

      {/* 右側：情報エリア */}
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {work?.category === "movie" ? "🎬 映画" : work?.category || "作品"}
          </div>
          <h3 className="font-bold text-base line-clamp-1">{work?.title}</h3>
          {work?.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {work.description}
            </p>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(work)}
              className="py-1.5 px-3 bg-secondary text-secondary-foreground text-xs rounded hover:opacity-90 transition-opacity"
            >
              編集
            </button>
          )}
          <button
            onClick={handleRemove}
            className="w-full py-1.5 bg-destructive text-destructive-foreground text-xs rounded hover:opacity-90 transition-opacity"
          >
            棚から外す
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkCard;