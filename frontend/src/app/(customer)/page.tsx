"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { HeroSearchWidget } from "@/components/shared/HeroSearchWidget";
import { Card } from "@/components/ui/Card";
import { useRankedDestinations } from "@/hooks/useRankedDestinations";
import { apiClient } from "@/lib/api-client";
import { cmsBannerImageUrl, cmsHeroImageUrl, cmsTileImageUrl, destinationCoverUrl, firstImageId, propertyImageUrl, tourImageUrl } from "@/lib/media";
import { formatMoney } from "@/lib/format";
import type { HomepageContent } from "@/types/cms";
import type { PropertySummary } from "@/types/stay";
import type { TourSummary } from "@/types/tour";

// A small alternating tilt per card — the "fanned deck" treatment used for the
// destinations rail, echoing sharetrip.net's own "Most Popular Destinations"
// section rather than a flat grid.
const TILTS = ["-rotate-3", "rotate-2", "-rotate-2", "rotate-3", "-rotate-1", "rotate-1"];

export default function HomePage() {
  const ranked = useRankedDestinations();
  const { data: cms } = useQuery({
    queryKey: ["cms", "homepage"],
    queryFn: () => apiClient.get<HomepageContent>("/api/v1/cms/homepage"),
  });
  const { data: tours } = useQuery({
    queryKey: ["home-tours"],
    queryFn: () => apiClient.get<TourSummary[]>("/api/v1/tours"),
  });
  const { data: properties } = useQuery({
    queryKey: ["home-properties"],
    queryFn: () => apiClient.get<PropertySummary[]>("/api/v1/properties"),
  });

  const topDestinations = ranked.slice(0, 6);

  // Admin-pinned listings (cms.featured_*) take priority, in the order they were
  // pinned; with none pinned, fall back to the first few published listings —
  // the site's original behavior, before this became admin-configurable.
  const pinnedTourIds = cms?.featured_tours.map((f) => f.entity_id) ?? [];
  const featuredTours = pinnedTourIds.length > 0
    ? (pinnedTourIds.map((id) => tours?.find((t) => t.id === id)).filter(Boolean) as TourSummary[])
    : (tours ?? []).slice(0, 4);

  const pinnedPropertyIds = cms?.featured_properties.map((f) => f.entity_id) ?? [];
  const featuredStays = pinnedPropertyIds.length > 0
    ? (pinnedPropertyIds.map((id) => properties?.find((p) => p.id === id)).filter(Boolean) as PropertySummary[])
    : (properties ?? []).slice(0, 4);

  const totalTours = ranked.reduce((s, d) => s + d.published_tour_count, 0);
  const totalProperties = ranked.reduce((s, d) => s + d.published_property_count, 0);
  const totalVehicles = ranked.reduce((s, d) => s + d.published_vehicle_count, 0);

  const heroImage = cms?.settings.has_hero_image
    ? cmsHeroImageUrl(new Date(cms.settings.updated_at).getTime())
    : ranked.map(destinationCoverUrl).find(Boolean);

  const settings = cms?.settings;

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero — full-bleed photo, headline, and the search widget as a floating
          card that overlaps the bottom edge of the photo (the pattern every
          real OTA homepage, sharetrip.net included, leads with). */}
      <section className="relative overflow-hidden px-6 pb-28 pt-20 sm:pb-36 sm:pt-28">
        <div className="absolute inset-0 -z-10">
          {heroImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImage} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950/10" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary-600 to-indigo-700" />
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
        >
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3.5 py-1 text-xs font-medium text-white backdrop-blur">
            {settings?.hero_badge_text ?? "Local experts, hosts & rentals — one marketplace"}
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
            {settings?.hero_headline ?? "Welcome to Ovigo"}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-100">
            {settings?.hero_subheadline ??
              "Discover verified local experts, hosts and rent-a-car partners by destination — every listing is admin-approved before it ever reaches you."}
          </p>
        </motion.div>
      </section>

      {/* The floating search card — pulled up over the hero's bottom edge via a
          negative margin, matching the "card breaks out of the photo" look. */}
      <div className="relative z-10 -mt-20 px-6 sm:-mt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className="mx-auto flex max-w-3xl flex-col items-center"
        >
          <HeroSearchWidget />

          {(totalTours > 0 || totalProperties > 0 || totalVehicles > 0) && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {totalTours > 0 && <span>{totalTours}+ tours</span>}
              {totalProperties > 0 && <span>{totalProperties}+ stays</span>}
              {totalVehicles > 0 && <span>{totalVehicles}+ vehicles</span>}
              <span>Every listing admin-verified</span>
            </div>
          )}
        </motion.div>
      </div>

      {topDestinations.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 pt-24 pb-20">
          <h2 className="text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {settings?.destinations_heading ?? "Most popular destinations"}
          </h2>
          <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {settings?.destinations_subheading ?? "Real listings, ready to book today."}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-x-2 gap-y-6 sm:gap-x-4">
            {topDestinations.map((dest, i) => {
              const cover = destinationCoverUrl(dest);
              const count = dest.published_tour_count + dest.published_property_count + dest.published_vehicle_count;
              return (
                <motion.div
                  key={dest.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className={`${TILTS[i % TILTS.length]} transition-transform duration-300 hover:z-10 hover:rotate-0 hover:scale-105`}
                >
                  <Link href={`/destinations/${dest.slug}`} className="group block">
                    <div className="relative h-52 w-36 overflow-hidden rounded-2xl bg-zinc-100 shadow-elevated sm:h-64 sm:w-44 dark:bg-zinc-800">
                      {cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt={dest.name} className="h-full w-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <p className="font-heading font-semibold text-white">{dest.name}</p>
                        <p className="text-xs text-zinc-200">
                          {count} listing{count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {featuredTours.length > 0 && (
        <section className="bg-zinc-50 py-20 dark:bg-zinc-950">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {settings?.tours_heading ?? "Featured tours"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {settings?.tours_subheading ?? "Fixed-date itineraries led by verified local experts."}
                </p>
              </div>
              <Link
                href="/tours"
                className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400 sm:flex"
              >
                See all tours <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featuredTours.map((tour, i) => {
                const cover = firstImageId(tour.images);
                return (
                  <motion.div
                    key={tour.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                  >
                    <Link href={`/tours/${tour.id}`}>
                      <Card hoverable variant="elevated" className="flex h-full flex-col overflow-hidden p-0">
                        <div className="aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800">
                          {cover && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={tourImageUrl(tour.id, cover.id)}
                              alt={tour.title}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-4">
                          <h3 className="line-clamp-1 font-semibold text-zinc-900 dark:text-zinc-50">{tour.title}</h3>
                          <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                            {tour.duration_days} days · from {formatMoney(tour.base_price)}
                          </p>
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {featuredStays.length > 0 && (
        <section className="py-20">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {settings?.stays_heading ?? "Best stays for your next trip"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {settings?.stays_subheading ?? "Hotels, resorts and homestays, booked directly from the host."}
                </p>
              </div>
              <Link
                href="/stays"
                className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400 sm:flex"
              >
                See all stays <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featuredStays.map((prop, i) => {
                const cover = firstImageId(prop.images);
                return (
                  <motion.div
                    key={prop.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                  >
                    <Link href={`/stays/${prop.id}`}>
                      <Card hoverable variant="elevated" className="flex h-full flex-col overflow-hidden p-0">
                        <div className="aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800">
                          {cover && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={propertyImageUrl(prop.id, cover.id)}
                              alt={prop.name}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-4">
                          <h3 className="line-clamp-1 font-semibold text-zinc-900 dark:text-zinc-50">{prop.name}</h3>
                          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 capitalize">{prop.property_type}</p>
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* "Grow your business" banner — sharetrip.net's own partner-recruitment
          section, adapted: a real link to the real partner-application flow. */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-3xl px-8 py-12 text-center shadow-elevated sm:flex-row sm:justify-between sm:text-left">
          <div className={settings?.has_banner_image ? "absolute inset-0 -z-10" : "absolute inset-0 -z-10 bg-gradient-to-r from-accent-400 to-accent-600"}>
            {settings?.has_banner_image && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cmsBannerImageUrl(new Date(settings.updated_at).getTime())}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/70 via-zinc-950/40 to-zinc-950/10" />
              </>
            )}
          </div>
          <div>
            <h2 className="font-heading text-2xl font-bold text-white">{settings?.banner_heading ?? "Grow your business with Ovigo"}</h2>
            <p className="mt-1 max-w-md text-sm text-white/90">
              {settings?.banner_text ??
                "List your tours, stays or vehicles and reach travelers actively looking to book — every listing goes through a real admin review, not an anonymous ad."}
            </p>
          </div>
          <Link
            href={settings?.banner_cta_link ?? "/account/partner"}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-accent-700 shadow-md transition-transform hover:-translate-y-0.5"
          >
            {settings?.banner_cta_label ?? "Become a Partner"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Explore by category — fully admin-managed tiles (title/subtitle/link/
          image-or-gradient), see cms/models.py's CategoryTile. */}
      {cms && cms.category_tiles.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {settings?.category_heading ?? "Explore by category"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {settings?.category_subheading ?? "Every listing is tied to a verified, admin-approved partner — not an anonymous ad."}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {cms.category_tiles.map((tile, i) => (
              <motion.div
                key={tile.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <Link href={tile.link} className="group relative block aspect-[3/4] overflow-hidden rounded-3xl bg-zinc-100 shadow-elevated dark:bg-zinc-800">
                  {tile.has_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cmsTileImageUrl(tile.id, new Date(tile.updated_at).getTime())}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                      style={{ background: `linear-gradient(135deg, ${tile.gradient_from}, ${tile.gradient_to})` }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-heading text-lg font-bold text-white">{tile.title}</p>
                    {tile.subtitle && <p className="text-xs text-zinc-200">{tile.subtitle}</p>}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
