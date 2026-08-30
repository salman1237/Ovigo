"use client";

import { useEffect, useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";

interface ImageItem {
  id: string;
  file_name: string;
}

interface ImageGalleryProps {
  /** e.g. `/api/v1/tours/{tourId}` or `/api/v1/properties/{propertyId}` — images live at `${basePath}/images` */
  basePath: string;
  images: ImageItem[];
  onChange: () => void;
  editable: boolean;
}

function ImageThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    apiClient.getBlob(url, { auth: true }).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!src) {
    return <div className="h-24 w-24 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />;
  }
  // Object URLs from an authenticated fetch don't work with next/image's remote loader.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-24 w-24 rounded-md object-cover" />;
}

export function ImageGallery({ basePath, images, onChange, editable }: ImageGalleryProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiClient.postForm(`${basePath}/images`, formData, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (imageId: string) => {
    try {
      await apiClient.delete(`${basePath}/images/${imageId}`, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove image");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((img) => (
          <div key={img.id} className="relative">
            <ImageThumb url={`${basePath}/images/${img.id}/file`} />
            {editable && (
              <button
                onClick={() => remove(img.id)}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white"
                aria-label={`Remove ${img.file_name}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <div className="mt-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
            className="text-xs"
          />
          {uploading && <p className="mt-1 text-xs text-zinc-400">Uploading…</p>}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
