"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

import { resolveWorkImageUrl } from "@/lib/google-books";
import { cn } from "@/lib/utils";

type WorkPosterProps = {
  src?: string | null;
  alt: string;
  className?: string;
};

export function WorkPoster({ src, alt, className }: WorkPosterProps) {
  const cover = resolveWorkImageUrl({ image_url: src });
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(cover) && !failed;

  return (
    <div
      className={cn(
        "relative isolate aspect-[2/3] w-full shrink-0 overflow-hidden bg-muted sm:w-32",
        className,
      )}
    >
      {showImage ? (
        <img
          src={cover}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground"
          aria-hidden={!alt}
        >
          <ImageOff className="size-8" aria-hidden />
          <span className="sr-only">画像なし</span>
        </div>
      )}
    </div>
  );
}

export function catalogImageUrl(item: {
  imageUrl?: string | null;
  image_url?: string | null;
}) {
  return resolveWorkImageUrl(item);
}
