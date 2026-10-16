"use client";

import { useEffect, useState } from "react";

export type ShelfViewMode = "cover" | "spine";

const STORAGE_KEY = "myshelf-view-mode";

function readShelfViewMode(value: string | null): ShelfViewMode {
  return value === "spine" ? "spine" : "cover";
}

export function useShelfViewMode(): readonly [
  ShelfViewMode,
  (mode: ShelfViewMode) => void,
] {
  const [mode, setMode] = useState<ShelfViewMode>("cover");

  useEffect(() => {
    setMode(readShelfViewMode(localStorage.getItem(STORAGE_KEY)));
  }, []);

  const update = (next: ShelfViewMode) => {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
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
    </div>
  );
}
