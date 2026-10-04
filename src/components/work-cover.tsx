import Image from "next/image";

import { upgradeGoogleBooksCoverUrl, upgradeItunesArtworkUrl } from "@/lib/google-books";
import { cn } from "@/lib/utils";

type WorkCoverProps = {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
};

export function WorkCover({
  src,
  alt,
  className,
  sizes = "(max-width: 640px) 100vw, 24rem",
}: WorkCoverProps) {
  const imageSrc = upgradeGoogleBooksCoverUrl(upgradeItunesArtworkUrl(src));

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      unoptimized
      sizes={sizes}
      className={cn("object-contain", className)}
    />
  );
}
