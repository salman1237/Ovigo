"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { firstImageId, propertyImageUrl, tourImageUrl } from "@/lib/media";
import { VEHICLE_TYPE_ICONS } from "@/lib/vehicleIcons";
import { PROPERTY_TYPE_LABELS } from "@/types/stay";
import { VEHICLE_TYPE_LABELS } from "@/types/rentcar";
import type { DestinationDetail } from "@/types/search";

export default function DestinationDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data: destination, isLoading, isError, error } = useQuery({
    queryKey: ["destination-detail", slug],
    queryFn: () => apiClient.get<DestinationDetail>(`/api/v1/search/destinations/${slug}`),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (isError || !destination) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <ErrorState
          message={error instanceof ApiError && error.status === 404 ? "Destination not found." : "Couldn't load this destination right now."}
        />
      </div>
    );
  }

  const heroImage = destination.cover_tour_id
    ? tourImageUrl(destination.cover_tour_id, destination.cover_tour_image_id!)
    : destination.cover_property_id
      ? propertyImageUrl(destination.cover_property_id, destination.cover_property_image_id!)
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      {/* Hero + breadcrumb */}
      <div className="relative overflow-hidden rounded-3xl">
        {heroImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="" className="h-64 w-full object-cover sm:h-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/30 to-transparent" />
          </>
        ) : (
          <div className="h-64 w-full bg-gradient-to-br from-primary-600 to-indigo-700 sm:h-80" />
        )}
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-zinc-200">
            {destination.breadcrumb.map((crumb, i) => (
              <span key={crumb.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-400" />}
                {i === destination.breadcrumb.length - 1 ? (
                  <span className="font-medium text-white">{crumb.name}</span>
                ) : (
                  <Link href={`/destinations/${crumb.slug}`} className="hover:text-white hover:underline">
                    {crumb.name}
                  </Link>
                )}
              </span>
            ))}
          </nav>
          <h1 className="text-2xl font-bold text-white sm:text-4xl">{destination.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-100">
            {destination.published_tour_count > 0 && <span>{destination.published_tour_count} tours</span>}
            {destination.published_property_count > 0 && <span>{destination.published_property_count} stays</span>}
            {destination.published_vehicle_count > 0 && <span>{destination.published_vehicle_count} vehicles</span>}
            {destination.experts.length > 0 && <span>{destination.experts.length} local experts</span>}
          </p>
        </div>
      </div>

      {destination.tours.length === 0 &&
        destination.stays.length === 0 &&
        destination.vehicles.length === 0 &&
        destination.experts.length === 0 && (
          <div className="mt-10">
            <EmptyState
              icon={MapPin}
              title="Nothing published here yet"
              description="Check back soon, or explore a nearby destination below."
            />
          </div>
        )}

      {/* Local Experts */}
      {destination.experts.length > 0 && (
        <Section title="Local Experts" subtitle="Verified, admin-approved experts who know this destination.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {destination.experts.map((expert, i) => (
              <FadeIn key={expert.partner_role_id} delay={i * 0.05}>
                <Card variant="elevated" className="flex h-full flex-col gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-white">
                    <Sparkles className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{expert.full_name}</h3>
                  {expert.headline && <p className="text-sm text-primary-600 dark:text-primary-400">{expert.headline}</p>}
                  {expert.bio && <p className="line-clamp-2 text-xs text-zinc-500">{expert.bio}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-zinc-500">
                    {expert.successful_tour_count > 0 && (
                      <Badge variant="accent">{expert.successful_tour_count} completed tours</Badge>
                    )}
                    {expert.years_experience != null && <span>{expert.years_experience} yrs experience</span>}
                  </div>
                </Card>
              </FadeIn>
            ))}
          </div>
        </Section>
      )}

      {/* Tours */}
      {destination.tours.length > 0 && (
        <Section title="Tours" subtitle="Fixed-date tours led by verified local experts.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {destination.tours.map((tour, i) => {
              const cover = firstImageId(tour.images);
              return (
                <FadeIn key={tour.id} delay={i * 0.05}>
                  <Link href={`/tours/${tour.id}`}>
                    <Card hoverable variant="elevated" className="flex h-full flex-col overflow-hidden p-0">
                      <div className="aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800">
                        {cover && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tourImageUrl(tour.id, cover.id)} alt={tour.title} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="line-clamp-1 font-semibold text-zinc-900 dark:text-zinc-50">{tour.title}</h3>
                        <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                          {tour.duration_days} days · from {formatMoney(tour.base_price)}{" "}
                          <ApproxPrice amountBDT={tour.base_price} />
                        </p>
                      </div>
                    </Card>
                  </Link>
                </FadeIn>
              );
            })}
          </div>
        </Section>
      )}

      {/* Stays */}
      {destination.stays.length > 0 && (
        <Section title="Stays" subtitle="Hotels, resorts and homestays, booked directly from the host.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {destination.stays.map((prop, i) => {
              const cover = firstImageId(prop.images);
              return (
                <FadeIn key={prop.id} delay={i * 0.05}>
                  <Link href={`/stays/${prop.id}`}>
                    <Card hoverable variant="elevated" className="flex h-full flex-col overflow-hidden p-0">
                      <div className="aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800">
                        {cover && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={propertyImageUrl(prop.id, cover.id)} alt={prop.name} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="line-clamp-1 font-semibold text-zinc-900 dark:text-zinc-50">{prop.name}</h3>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 capitalize">
                          {PROPERTY_TYPE_LABELS[prop.property_type]}
                        </p>
                      </div>
                    </Card>
                  </Link>
                </FadeIn>
              );
            })}
          </div>
        </Section>
      )}

      {/* Rent a Car */}
      {destination.vehicles.length > 0 && (
        <Section title="Rent a Car" subtitle="Sedans, SUVs and vans, with or without a driver.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {destination.vehicles.map((v, i) => {
              const TypeIcon = VEHICLE_TYPE_ICONS[v.vehicle_type];
              return (
                <FadeIn key={v.id} delay={i * 0.05}>
                  <Link href={`/rent-a-car/${v.id}`}>
                    <Card hoverable variant="elevated" className="flex h-full flex-col overflow-hidden p-0">
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-primary-500 to-indigo-600">
                        <TypeIcon className="h-12 w-12 text-white/90" strokeWidth={1.25} />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="line-clamp-1 font-semibold text-zinc-900 dark:text-zinc-50">
                          {v.make} {v.model}
                        </h3>
                        <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                          {VEHICLE_TYPE_LABELS[v.vehicle_type]} · {formatMoney(v.price_per_day)}/day
                        </p>
                      </div>
                    </Card>
                  </Link>
                </FadeIn>
              );
            })}
          </div>
        </Section>
      )}

      {/* Nearby destinations */}
      {destination.nearby.length > 0 && (
        <Section title="Nearby destinations" subtitle="Other places to explore close by.">
          <div className="flex flex-wrap gap-4">
            {destination.nearby.map((dest, i) => {
              const cover = dest.cover_tour_id
                ? tourImageUrl(dest.cover_tour_id, dest.cover_tour_image_id!)
                : dest.cover_property_id
                  ? propertyImageUrl(dest.cover_property_id, dest.cover_property_image_id!)
                  : null;
              return (
                <FadeIn key={dest.id} delay={i * 0.05}>
                  <Link href={`/destinations/${dest.slug}`} className="group block">
                    <div className="relative h-40 w-32 overflow-hidden rounded-2xl bg-zinc-100 shadow-elevated dark:bg-zinc-800">
                      {cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt={dest.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-2.5">
                        <p className="text-sm font-semibold text-white">{dest.name}</p>
                      </div>
                    </div>
                  </Link>
                </FadeIn>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, delay }}
    >
      {children}
    </motion.div>
  );
}
