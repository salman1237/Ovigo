"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, Car, Map, Smartphone, UserCheck } from "lucide-react";
import Link from "next/link";

import { HeroSearchWidget } from "@/components/shared/HeroSearchWidget";
import { Card } from "@/components/ui/Card";
import { apiClient } from "@/lib/api-client";
import { destinationCoverUrl } from "@/lib/media";
import type { DestinationSummary } from "@/types/search";

const FEATURES = [
  {
    icon: Map,
    title: "Tours",
    description: "Fixed-date tours led by verified local experts, with full itineraries and transparent pricing.",
    href: "/tours",
  },
  {
    icon: Building2,
    title: "Stays",
    description: "Book rooms directly from hosts and hotels, with real-time availability and instant confirmation.",
    href: "/stays",
  },
  {
    icon: Car,
    title: "Rent a Car",
    description: "Pick a vehicle by date range — sedans, SUVs and vans, with or without a driver.",
    href: "/rent-a-car",
  },
  {
    icon: UserCheck,
    title: "Local Experts",
    description: "Every listing is tied to a verified, admin-approved partner — not an anonymous ad.",
    href: "/account/partner",
  },
  {
    icon: Smartphone,
    title: "eSIM",
    description: "Instant mobile data in 190+ countries — install before you land, no roaming surprises.",
    href: "/esim",
  },
];

export default function HomePage() {
  const { data: destinations } = useQuery({
    queryKey: ["home-destinations"],
    queryFn: () => apiClient.get<DestinationSummary[]>("/api/v1/search/destinations"),
  });

  const ranked = [...(destinations ?? [])].sort(
    (a, b) =>
      b.published_tour_count + b.published_property_count + b.published_vehicle_count -
      (a.published_tour_count + a.published_property_count + a.published_vehicle_count)
  );
  const topDestinations = ranked.slice(0, 6);
  const heroImage = ranked.map(destinationCoverUrl).find(Boolean);

  const totalTours = (destinations ?? []).reduce((s, d) => s + d.published_tour_count, 0);
  const totalProperties = (destinations ?? []).reduce((s, d) => s + d.published_property_count, 0);
  const totalVehicles = (destinations ?? []).reduce((s, d) => s + d.published_vehicle_count, 0);

  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-24 sm:py-32">
        <div className="absolute inset-0 -z-10">
          {heroImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImage} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/50 to-white dark:to-zinc-950" />
            </>
          ) : (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary-400/30 blur-3xl dark:bg-primary-600/20" />
              <div className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-indigo-400/30 blur-3xl dark:bg-indigo-600/20" />
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
        >
          <span
            className={`mb-5 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-medium ${
              heroImage
                ? "border-white/30 bg-white/10 text-white backdrop-blur"
                : "border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-900 dark:bg-primary-950 dark:text-primary-300"
            }`}
          >
            Local experts, hosts &amp; rentals — one marketplace
          </span>
          <h1
            className={`text-4xl font-bold tracking-tight sm:text-6xl ${
              heroImage ? "text-white" : "text-zinc-900 dark:text-zinc-50"
            }`}
          >
            Book{" "}
            <span
              className={
                heroImage
                  ? "text-accent-400"
                  : "bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-transparent"
              }
            >
              tours, stays &amp; rides
            </span>{" "}
            with confidence.
          </h1>
          <p className={`mt-5 max-w-xl text-lg ${heroImage ? "text-zinc-100" : "text-zinc-600 dark:text-zinc-400"}`}>
            Discover verified local experts, guides, hosts and rent-a-car partners by destination — every listing is
            admin-approved before it ever reaches you.
          </p>

          <div className="mt-9 w-full">
            <HeroSearchWidget />
          </div>

          {(totalTours > 0 || totalProperties > 0 || totalVehicles > 0) && (
            <div
              className={`mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-medium ${
                heroImage ? "text-zinc-200" : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {totalTours > 0 && <span>{totalTours}+ tours</span>}
              {totalProperties > 0 && <span>{totalProperties}+ stays</span>}
              {totalVehicles > 0 && <span>{totalVehicles}+ vehicles</span>}
              <span>Every listing admin-verified</span>
            </div>
          )}

          <Link
            href="/account/partner"
            className={`mt-6 text-sm font-medium underline-offset-4 hover:underline ${
              heroImage ? "text-zinc-100" : "text-primary-600 dark:text-primary-400"
            }`}
          >
            List your tours, stays or vehicles on Ovigo →
          </Link>
        </motion.div>
      </section>

      {topDestinations.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 pb-20">
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Popular destinations</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Real listings, ready to book today.</p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
                >
                  <Link href={`/tours?location_slug=${dest.slug}`} className="group block">
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 shadow-elevated dark:bg-zinc-800">
                      {cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt={dest.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <p className="font-heading font-semibold text-white">{dest.name}</p>
                        <p className="text-xs text-zinc-200">{count} listing{count === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Why Ovigo</h2>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <Link href={feature.href}>
                <Card hoverable variant="elevated" className="flex h-full flex-col gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-md shadow-primary-600/20">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{feature.title}</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{feature.description}</p>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
