"use client";

import React from "react";

export type WorkCardProps = {
  work: {
    id?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    image_url?: string;
  };
  onRemove?: () => void;
  onDeleted?: () => void;
  onEdit?: (work: any) => void;
  onAdded?: () => void;
};

export function WorkCard({ work, onRemove, onDeleted, onEdit }: WorkCardProps) {
  const handleRemove = () => {
    if (onRemove) onRemove();
    if (onDeleted) onDeleted();
  };

  const displayImage = work?.imageUrl || work?.image_url;

  return (
    <div className="flex flex-row bg-card text-card-foreground rounded-lg border shadow-sm overflow-hidden w-full my-2">
      {/* 左側：画像枠（横幅を固定して必ずスペースを確保） */}
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

      {/* 右側：情報エリアと削除ボタン */}
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
            onClick={handleRemove}
            className="w-full py-1.5 bg-destructive text-destructive-foreground text-xs rounded hover:opacity-90 transition-opacity text-center font-medium"
          >
            棚から外す
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkCard;