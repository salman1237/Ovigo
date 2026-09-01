"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { AdminBadge, BADGE_STATUS_LABELS, BADGE_TYPE_LABELS, BadgeEntityType, BadgeType } from "@/types/badges";

const APPLICABLE_TYPES: Record<BadgeEntityType, BadgeType[]> = {
  tour: ["verified", "safety_certified"],
  property: ["verified", "safety_certified", "couple_friendly"],
  partner_role: ["verified"],
};

export function BadgeApplications({ entityType, entityId }: { entityType: BadgeEntityType; entityId: string }) {
  const queryClient = useQueryClient();
  const [applyingType, setApplyingType] = useState<BadgeType | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: myBadges } = useQuery({
    queryKey: ["badges", "mine"],
    queryFn: () => apiClient.get<AdminBadge[]>("/api/v1/badges/mine", { auth: true }),
  });

  const forThisEntity = (myBadges ?? []).filter((b) => b.entity_type === entityType && b.entity_id === entityId);

  const apply = async (badgeType: BadgeType) => {
    setError(null);
    setBusy(true);
    try {
      await apiClient.post(
        "/api/v1/badges/apply",
        { entity_type: entityType, entity_id: entityId, badge_type: badgeType, private_note: note || undefined },
        { auth: true }
      );
      setApplyingType(null);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["badges"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to apply");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {APPLICABLE_TYPES[entityType].map((badgeType) => {
        const existing = forThisEntity.find((b) => b.badge_type === badgeType);
        return (
          <div key={badgeType} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            <span>{BADGE_TYPE_LABELS[badgeType]}</span>
            {existing ? (
              <span className="text-xs text-zinc-500">
                {BADGE_STATUS_LABELS[existing.status]}
                {existing.status === "rejected" && existing.rejection_reason && ` — ${existing.rejection_reason}`}
              </span>
            ) : applyingType === badgeType ? (
              <div className="flex items-center gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note for admin (optional)"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button onClick={() => apply(badgeType)} disabled={busy} className="text-xs font-medium text-emerald-600 disabled:opacity-50">
                  Submit
                </button>
                <button onClick={() => setApplyingType(null)} className="text-xs text-zinc-500">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setApplyingType(badgeType)} className="text-xs font-medium text-zinc-900 underline dark:text-zinc-50">
                Apply
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
