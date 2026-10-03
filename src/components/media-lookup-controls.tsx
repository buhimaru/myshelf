"use client";

import { Button } from "@/components/ui/button";
import type { MediaLookupResult } from "@/lib/google-books";

type MediaLookupButtonProps = {
  isLookingUp: boolean;
  disabled?: boolean;
  onLookup: () => void;
};

export function MediaLookupButton({
  isLookingUp,
  disabled,
  onLookup,
}: MediaLookupButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={isLookingUp || disabled}
      className="shrink-0"
      onClick={onLookup}
    >
      {isLookingUp ? "検索中..." : "あらすじ・画像を取得"}
    </Button>
  );
}

type MediaLookupCandidatesProps = {
  items: MediaLookupResult[];
  onSelect: (item: MediaLookupResult) => void;
};

export function MediaLookupCandidates({
  items,
  onSelect,
}: MediaLookupCandidatesProps) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <ul className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-background"
            onClick={() => onSelect(item)}
          >
            <span className="font-medium">{item.title}</span>
            {item.authors ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {item.authors}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
