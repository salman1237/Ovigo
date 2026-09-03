"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { apiClient } from "@/lib/api-client";
import { PROPERTY_TYPE_LABELS, type PropertySummary } from "@/types/stay";

export function SimilarProperties({ propertyId }: { propertyId: string }) {
  const { data: properties } = useQuery({
    queryKey: ["similar-properties", propertyId],
    queryFn: () => apiClient.get<PropertySummary[]>(`/api/v1/properties/${propertyId}/similar`),
  });

  if (!properties || properties.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Similar stays</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {properties.map((property) => (
          <Link key={property.id} href={`/stays/${property.id}`}>
            <Card hoverable className="flex h-full flex-col p-3">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{property.name}</p>
              <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                {PROPERTY_TYPE_LABELS[property.property_type]}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
