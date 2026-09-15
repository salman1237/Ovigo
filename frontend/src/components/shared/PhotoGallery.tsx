"use client";

import { useState } from "react";

interface GalleryImage {
  id: string;
  sort_order: number;
}

export function PhotoGallery<T extends GalleryImage>({
  images,
  urlFor,
  alt,
}: {
  images: T[];
  urlFor: (image: T) => string;
  alt: string;
}) {
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);
  const [activeId, setActiveId] = useState(sorted[0]?.id);
  const active = sorted.find((img) => img.id === activeId) ?? sorted[0];

  if (sorted.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urlFor(active)} alt={alt} className="h-full w-full object-cover" />
      </div>
      {sorted.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {sorted.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveId(img.id)}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                img.id === active.id ? "border-primary-600" : "border-transparent opacity-80 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlFor(img)} alt={alt} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
