"use client";

import { useLayoutEffect, useState } from "react";

export type ShelfViewMode = "cover" | "spine" | "photo";

function readShelfViewMode(value: string | null): ShelfViewMode {
  if (value === "spine") return "spine";
  if (value === "photo") return "photo";
  return "cover";
}

export function ownShelfViewModeKey(userId: string) {
  return `myshelf-view-mode:own:${userId}`;
}

export function publicShelfViewModeKey(ownerId: string) {
  return `myshelf-view-mode:shelf:${ownerId}`;
}

export function useShelfViewMode(storageKey: string): readonly [
  ShelfViewMode,
  (mode: ShelfViewMode) => void,
] {
  const [mode, setMode] = useState<ShelfViewMode>("cover");

  useLayoutEffect(() => {
    setMode(readShelfViewMode(localStorage.getItem(storageKey)));
  }, [storageKey]);

  const update = (next: ShelfViewMode) => {
    setMode(next);
    localStorage.setItem(storageKey, next);
  };

  return [mode, update] as const;
}

type ShelfViewModeToggleProps = {
  mode: ShelfViewMode;
  onChange: (mode: ShelfViewMode) => void;
};

export default function ShelfViewModeToggle({
  mode,
  onChange,
}: ShelfViewModeToggleProps) {
  return (
    <div className="shelf-view-mode" role="group" aria-label="棚の表示">
      <button
        type="button"
        className={mode === "cover" ? "is-active" : ""}
        aria-pressed={mode === "cover"}
        onClick={() => onChange("cover")}
      >
        表紙
      </button>
      <button
        type="button"
        className={mode === "spine" ? "is-active" : ""}
        aria-pressed={mode === "spine"}
        onClick={() => onChange("spine")}
      >
        背表紙
      </button>
      <button
        type="button"
        className={mode === "photo" ? "is-active" : ""}
        aria-pressed={mode === "photo"}
        onClick={() => onChange("photo")}
      >
        画像棚
      </button>
    </div>
  );
}
