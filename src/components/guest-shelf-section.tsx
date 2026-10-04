"use client";

import React, { useEffect, useState } from "react";
import { readGuestShelf, removeGuestWork, GuestWork } from "@/lib/guest-shelf";
import { WorkCard } from "@/components/work-card";

export type GuestShelfSectionProps = {
  works?: GuestWork[];
  onDeleted?: () => void;
};

export function GuestShelfSection({ works: propsWorks, onDeleted }: GuestShelfSectionProps) {
  const [localWorks, setLocalWorks] = useState<GuestWork[]>([]);

  const loadShelf = () => {
    setLocalWorks(readGuestShelf());
  };

  useEffect(() => {
    loadShelf();
    window.addEventListener("myshelf_guest_shelf_updated", loadShelf);
    return () => {
      window.removeEventListener("myshelf_guest_shelf_updated", loadShelf);
    };
  }, []);

  // 親から works が渡されている場合はそれを優先し、無ければ localStorage のデータを使用
  const displayWorks = propsWorks || localWorks;

  const handleRemove = (idOrTitle: string) => {
    const updated = removeGuestWork(idOrTitle);
    setLocalWorks(updated);
    if (onDeleted) {
      onDeleted();
    }
  };

  if (displayWorks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayWorks.map((work) => (
          <WorkCard
            key={work.id || work.title}
            work={work}
            onRemove={() => handleRemove(work.id || work.title)}
            onDeleted={() => handleRemove(work.id || work.title)}
          />
        ))}
      </div>
    </div>
  );
}

export default GuestShelfSection;