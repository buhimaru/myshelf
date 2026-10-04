import React from "react";

export type WorkCardProps = {
  work: any;
  onRemove?: (id: string) => void;
  onDeleted?: (id: string) => void;
  onEdit?: (work: any) => void;
};

export function WorkCard({ work, onRemove, onDeleted, onEdit }: WorkCardProps) {
  // 画像URLを取得。無ければダミー画像を表示
  const imageUrl =
    work?.imageUrl ||
    work?.image_url ||
    work?.image ||
    work?.cover ||
    "https://placehold.co/100x150?text=No+Image";

  const handleRemove = () => {
    if (onDeleted) {
      onDeleted(work.id || work.title);
    } else if (onRemove) {
      onRemove(work.id || work.title);
    }
  };

  return (
    <div className="border rounded-lg p-3 shadow-sm bg-card text-card-foreground flex gap-3 items-start">
      {/* 左側に固定サイズの画像エリア（絶対消えないように設定） */}
      <div className="h-32 w-24 shrink-0 rounded overflow-hidden bg-muted border">
        <img
          src={imageUrl}
          alt={work?.title || "作品画像"}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              "https://placehold.co/100x150?text=No+Image";
          }}
        />
      </div>

      {/* 右側にテキストとボタン */}
      <div className="flex flex-col justify-between flex-1 min-w-0 h-full">
        <div>
          <span className="inline-block text-xs px-2 py-0.5 bg-secondary rounded mb-1">
            {work?.category}
          </span>
          <h3 className="font-bold text-base line-clamp-1">{work?.title}</h3>
          {work?.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {work.description}
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(work)}
              className="text-xs text-primary hover:underline"
            >
              編集
            </button>
          )}
          {(onRemove || onDeleted) && (
            <button
              onClick={handleRemove}
              className="w-full py-1.5 bg-destructive text-destructive-foreground text-xs font-medium rounded hover:bg-destructive/90"
            >
              棚から外す
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorkCard;