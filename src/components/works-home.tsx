"use client";

import React, { useEffect, useState } from "react";
import { readGuestShelf, Guestwork } from "@/lib/guest-shelf";
import CatalogSearchSection from "@/components/catalog-search-section";
import GuestShelfSection from "@/components/guest-shelf-section";

export default function WorksHome() {
  const [works, setWorks] = useState<Guestwork[]>([]);

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
          <GuestShelfSection
            works={works}
            onDeleted={loadShelf}
          />
        )}
      </div>
    </div>
  );
}