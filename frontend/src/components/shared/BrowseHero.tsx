"use client";

import { useRankedDestinations } from "@/hooks/useRankedDestinations";
import { destinationCoverUrl } from "@/lib/media";

/** The rounded photo banner behind a browse page's title + search widget —
 * the same "real photography, not a blank page" principle as the homepage
 * hero, so Tours/Stays/Rent-a-Car don't look like a bare form. `photoIndex`
 * picks a different destination per page so the three browse pages don't all
 * show the identical photo. */
export function BrowseHero({
  title,
  subtitle,
  photoIndex = 0,
}: {
  title: string;
  subtitle: string;
  photoIndex?: number;
}) {
  const ranked = useRankedDestinations();
  const photos = ranked.map(destinationCoverUrl).filter((url): url is string => !!url);
  const image = photos.length > 0 ? photos[photoIndex % photos.length] : null;

  return (
    <div className="relative overflow-hidden rounded-3xl">
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-56 w-full object-cover sm:h-64" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/25 to-transparent" />
        </>
      ) : (
        <div className="h-56 w-full bg-gradient-to-br from-primary-600 to-indigo-700 sm:h-64" />
      )}
      <div className="absolute inset-x-0 bottom-0 p-6 pb-10 sm:p-8 sm:pb-14">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-zinc-100">{subtitle}</p>
      </div>
    </div>
  );
}
