"use client";

import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { tourImageUrl } from "@/lib/media";
import type { TourImage } from "@/types/tour";

/** Hero mosaic (one large photo + up to four tiles) with a full-screen viewer. */
export function TourGallery({ tourId, title, images }: { tourId: string; title: string; images: TourImage[] }) {
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);
  const [open, setOpen] = useState<number | null>(null);

  if (sorted.length === 0) {
    return (
      <div className="flex aspect-[21/9] w-full items-center justify-center rounded-3xl bg-gradient-to-br from-primary-500 via-indigo-500 to-accent-500 text-white/90">
        <Images className="h-10 w-10" strokeWidth={1.25} />
      </div>
    );
  }

  const url = (img: TourImage) => tourImageUrl(tourId, img.id);
  const tiles = sorted.slice(1, 5);

  return (
    <>
      <div className="relative grid h-[260px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-3xl sm:h-[380px] lg:h-[440px]">
        <button
          type="button"
          onClick={() => setOpen(0)}
          className={`group relative overflow-hidden ${tiles.length ? "col-span-4 row-span-2 sm:col-span-2" : "col-span-4 row-span-2"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url(sorted[0])} alt={title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        </button>
        {tiles.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpen(i + 1)}
            className={`group relative hidden overflow-hidden sm:block ${tileSpan(tiles.length, i)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url(img)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
          </button>
        ))}
        {sorted.length > 1 && (
          <button
            type="button"
            onClick={() => setOpen(0)}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-zinc-900 shadow-lg backdrop-blur transition hover:bg-white dark:bg-zinc-900/90 dark:text-zinc-50"
          >
            <Images className="h-4 w-4" /> Show all {sorted.length} photos
          </button>
        )}
      </div>
      {open !== null && <Lightbox images={sorted} url={url} start={open} title={title} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Grid placement so 1–4 tiles always fill the 2×2 area beside the main photo. */
function tileSpan(count: number, index: number): string {
  if (count === 1) return "col-span-2 row-span-2";
  if (count === 2) return "row-span-2";
  if (count === 3 && index === 2) return "col-span-2";
  return "";
}

function Lightbox({
  images,
  url,
  start,
  title,
  onClose,
}: {
  images: TourImage[];
  url: (img: TourImage) => string;
  start: number;
  title: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const step = useCallback((delta: number) => setIndex((i) => (i + delta + images.length) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, step]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title} photos`} className="fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white/80">
        <span>
          {index + 1} / {images.length}
        </span>
        <button type="button" onClick={onClose} aria-label="Close photos" className="rounded-full p-2 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url(images[index])} alt={`${title} — photo ${index + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:left-4">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:right-4">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 ${i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url(img)} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
