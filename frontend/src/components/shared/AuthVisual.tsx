"use client";

import { useRankedDestinations } from "@/hooks/useRankedDestinations";
import { destinationCoverUrl } from "@/lib/media";

/** The photo side of the login/register split layout — real destination
 * photography (same source as the homepage hero), not a stock illustration.
 * Hidden below lg: a login form doesn't need to fight for space on a phone. */
export function AuthVisual({ tagline }: { tagline: string }) {
  const ranked = useRankedDestinations();
  const image = ranked.map(destinationCoverUrl).find(Boolean);

  return (
    <div className="relative hidden w-full max-w-md shrink-0 overflow-hidden lg:block">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600 to-indigo-700" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-zinc-950/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-8">
        <p className="font-heading text-2xl font-bold text-white">{tagline}</p>
        <p className="mt-1 text-sm text-zinc-200">Every listing is admin-verified before it ever reaches you.</p>
      </div>
    </div>
  );
}
