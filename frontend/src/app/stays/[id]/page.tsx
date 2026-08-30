"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import { AMENITY_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/types/stay";

export default function StayDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: property, isLoading, error } = useQuery({
    queryKey: ["public-property", id],
    queryFn: () => apiClient.get<Property>(`/api/v1/properties/${id}`),
    retry: false,
  });

  if (isLoading) return <p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>;
  if (error || !property) return <p className="px-6 py-12 text-sm text-zinc-400">Property not found.</p>;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{property.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">{PROPERTY_TYPE_LABELS[property.property_type]}</p>
      {property.description && <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{property.description}</p>}

      {property.amenities.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Amenities</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {property.amenities.map((a) => (
              <span key={a.amenity} className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
                {AMENITY_LABELS[a.amenity]}
              </span>
            ))}
          </div>
        </div>
      )}

      {property.room_types.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Room types</h2>
          <div className="mt-2 flex flex-col gap-2">
            {property.room_types.map((rt) => (
              <div key={rt.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <p className="font-medium">{rt.name}</p>
                <p className="text-zinc-500">Up to {rt.max_occupancy} guests · ${rt.base_price}/night</p>
                {rt.description && <p className="mt-1 text-zinc-400">{rt.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(property.check_in_time || property.check_out_time || property.cancellation_policy || property.house_rules) && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Policies</h2>
          <dl className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {property.check_in_time && <div><dt className="inline font-medium">Check-in: </dt><dd className="inline">{property.check_in_time}</dd></div>}
            {property.check_out_time && <div><dt className="inline font-medium">Check-out: </dt><dd className="inline">{property.check_out_time}</dd></div>}
            {property.cancellation_policy && <div><dt className="inline font-medium">Cancellation: </dt><dd className="inline">{property.cancellation_policy}</dd></div>}
            {property.house_rules && <div><dt className="inline font-medium">House rules: </dt><dd className="inline">{property.house_rules}</dd></div>}
          </dl>
        </div>
      )}
    </div>
  );
}
