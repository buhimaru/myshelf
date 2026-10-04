"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { uploadWorkCover } from "@/lib/cover-upload";
import { cn } from "@/lib/utils";

const fieldClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type CoverUploadFieldProps = {
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
};

export function CoverUploadField({
  imageUrl,
  onImageUrlChange,
  disabled,
  onUploadingChange,
}: CoverUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewRef = useRef<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isUploadError, setIsUploadError] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
      }
    };
  }, []);

  function clearLocalPreview() {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    setLocalPreview(null);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    clearLocalPreview();
    const objectUrl = URL.createObjectURL(file);
    localPreviewRef.current = objectUrl;
    setLocalPreview(objectUrl);

    setIsUploading(true);
    onUploadingChange?.(true);
    setUploadMessage("アップロード中...");
    setIsUploadError(false);

    try {
      const publicUrl = await uploadWorkCover(file);
      onImageUrlChange(publicUrl);
      clearLocalPreview();
      setIsUploadError(false);
      setUploadMessage("画像をアップロードしました。");
    } catch (error) {
      console.error("[MyShelf] cover upload failed", error);
      const message =
        error instanceof Error
          ? error.message
          : "画像のアップロードに失敗しました。";
      setIsUploadError(true);
      setUploadMessage(message);
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const isBusy = disabled || isUploading;
  const visibleImageUrl = mounted ? imageUrl : "";
  const previewSrc = mounted ? localPreview || visibleImageUrl : "";

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">
        画像URL
        <span className="ml-1 font-normal text-muted-foreground">（任意）</span>
      </span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="url"
          name="image_url"
          value={visibleImageUrl}
          onChange={(event) => onImageUrlChange(event.target.value)}
          placeholder="https://example.com/cover.jpg"
          disabled={isBusy}
          suppressHydrationWarning
          className={fieldClassName}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? "アップロード中..." : "画像を選択"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          disabled={isBusy}
          className="sr-only"
          onChange={(event) => void handleFileChange(event)}
        />
      </div>
      {previewSrc ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-2">
          <img
            src={previewSrc}
            alt="選択した表紙のプレビュー"
            className="h-20 w-16 rounded-md bg-background object-contain"
            suppressHydrationWarning
          />
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {isUploading ? "アップロード中..." : imageUrl}
          </p>
        </div>
      ) : null}
      {uploadMessage ? (
        <p
          className={cn(
            "text-sm",
            isUploadError ? "text-destructive" : "text-muted-foreground",
          )}
          role={isUploadError ? "alert" : "status"}
        >
          {uploadMessage}
        </p>
      ) : null}
    </div>
  );
}
