"use client";

import React, { useState, useEffect } from "react";
import GuestShelfSection from "@/components/guest-shelf-section";
import CatalogSearchSection from "@/components/catalog-search-section";

export default function WorksHome() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUpdated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-8">
      {/* 検索・追加エリア */}
      <CatalogSearchSection onAdded={handleUpdated} />

      {/* あなたの本棚エリア */}
      <div>
        <h2 className="text-xl font-bold mb-3">あなたの本棚</h2>
        <GuestShelfSection key={refreshKey} onDeleted={handleUpdated} />
      </div>
    </div>
  );
}