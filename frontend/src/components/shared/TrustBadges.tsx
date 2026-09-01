"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { Badge, BADGE_TYPE_LABELS, BadgeEntityType } from "@/types/badges";

const BADGE_STYLES: Record<string, string> = {
  verified: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  top_rated: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  couple_friendly: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  safety_certified: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

export function TrustBadges({ entityType, entityId }: { entityType: BadgeEntityType; entityId: string }) {
  const { data: badges } = useQuery({
    queryKey: ["badges", entityType, entityId],
    queryFn: () => apiClient.get<Badge[]>(`/api/v1/badges?entity_type=${entityType}&entity_id=${entityId}`),
  });

  if (!badges || badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <span key={b.id} className={`rounded-full px-3 py-1 text-xs font-medium ${BADGE_STYLES[b.badge_type]}`}>
          {BADGE_TYPE_LABELS[b.badge_type]}
        </span>
      ))}
    </div>
  );
}
