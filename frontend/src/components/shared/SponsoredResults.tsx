"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { apiClient } from "@/lib/api-client";
import type { AdEntityType, SponsoredResult } from "@/types/ads";

export function SponsoredResults({
  locationSlug,
  entityType,
  linkPrefix,
}: {
  locationSlug: string;
  entityType: AdEntityType;
  linkPrefix: string;
}) {
  const { data } = useQuery({
    queryKey: ["sponsored", entityType, locationSlug],
    queryFn: () =>
      apiClient.get<SponsoredResult[]>(
        `/api/v1/ads/sponsored?location_slug=${encodeURIComponent(locationSlug)}&entity_type=${entityType}`
      ),
    enabled: !!locationSlug,
  });

  if (!data || data.length === 0) return null;

  const trackClick = (campaignId: string) => {
    apiClient.post(`/api/v1/ads/campaigns/${campaignId}/click`).catch(() => {});
  };

  return (
    <div className="mb-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Sponsored</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((r) => (
          <Link key={r.campaign_id} href={`${linkPrefix}/${r.entity_id}`} onClick={() => trackClick(r.campaign_id)}>
            <Card hoverable className="border-primary-200 dark:border-primary-800">
              <Badge variant="primary" className="mb-2">
                Sponsored
              </Badge>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{r.entity_title}</h3>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
