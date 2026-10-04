"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  GUIDE_PROFILE_STATUS_LABELS,
  type AdminGuideProfile,
  type GuideProfileStatus,
  packageDuration,
} from "@/types/guides";

const STATUS_BADGE: Record<GuideProfileStatus, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  rejected: "danger",
  suspended: "danger",
};

/** Phase 9.3: a guide's public listing goes live only after review here, like a
 * tour, stay or vehicle. */
export function GuideProfileReview() {
  const [status, setStatus] = useState<GuideProfileStatus | "">("pending_review");
  const { data: profiles, isLoading, isError } = useQuery({
    queryKey: ["admin-guide-profiles", status],
    queryFn: () =>
      apiClient.get<AdminGuideProfile[]>(`/api/v1/admin/guides/profiles${status ? `?status=${status}` : ""}`, { auth: true }),
    retry: false,
  });

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Public profiles</h2>
        <Select value={status} onChange={(e) => setStatus(e.target.value as GuideProfileStatus | "")} className="w-auto">
          <option value="pending_review">Awaiting review</option>
          <option value="published">Live</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Changes requested</option>
          <option value="">All submitted</option>
        </Select>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Approving a profile lets travelers book the guide&apos;s packages directly. Ovigo takes 12% of each booking.
      </p>
      {isLoading && <Spinner />}
      {isError && <p className="mt-3 text-sm text-red-600">Failed to load guide profiles.</p>}
      {profiles && profiles.length === 0 && <p className="mt-3 text-sm text-zinc-400">Nothing here.</p>}
      <div className="mt-3 flex flex-col gap-3">
        {(profiles ?? []).map((p) => (
          <ProfileCard key={`${p.profile.guide_role_id}-${p.profile.status}`} item={p} />
        ))}
      </div>
    </section>
  );
}

function ProfileCard({ item }: { item: AdminGuideProfile }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState<"reject" | "suspend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { profile } = item;

  const act = async (action: "approve" | "reject" | "suspend" | "unsuspend") => {
    setError(null);
    try {
      await apiClient.post(
        `/api/v1/admin/guides/profiles/${profile.guide_role_id}/${action}`,
        action === "reject" || action === "suspend" ? { reason } : undefined,
        { auth: true }
      );
      queryClient.invalidateQueries({ queryKey: ["admin-guide-profiles"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{item.guide.full_name}</p>
          <p className="text-xs text-zinc-500">
            {item.guide.email} · guide role {item.role_status}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[profile.status]}>{GUIDE_PROFILE_STATUS_LABELS[profile.status]}</Badge>
      </div>
      <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
        <p className="font-medium">{profile.headline}</p>
        <p className="text-xs text-zinc-500">
          {[profile.city, (profile.languages ?? []).join(", "), profile.years_experience !== null ? `${profile.years_experience} yrs` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {profile.bio && <p className="mt-2 whitespace-pre-line">{profile.bio}</p>}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {item.packages.map((pkg) => (
          <li key={pkg.id}>
            <Badge variant={pkg.is_active ? "primary" : "neutral"}>
              {pkg.name}
              {packageDuration(pkg) ? ` (${packageDuration(pkg)})` : ""} · {formatMoney(pkg.price)}
              {!pkg.is_active && " · hidden"}
            </Badge>
          </li>
        ))}
      </ul>
      {profile.rejection_reason && (profile.status === "rejected" || profile.status === "suspended") && (
        <p className="mt-2 text-xs text-red-600">Reason: {profile.rejection_reason}</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {asking ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={asking === "reject" ? "What should the guide change?" : "Why is this profile suspended?"}
            className="h-9 min-w-64 flex-1 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <Button size="sm" variant="destructive" disabled={reason.trim().length < 3} onClick={() => act(asking)}>
            {asking === "reject" ? "Send back" : "Suspend"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.status === "pending_review" && (
            <>
              <Button size="sm" onClick={() => act("approve")}>
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setAsking("reject")}>
                Request changes
              </Button>
            </>
          )}
          {profile.status === "published" && (
            <Button size="sm" variant="destructive" onClick={() => setAsking("suspend")}>
              Suspend
            </Button>
          )}
          {profile.status === "suspended" && (
            <Button size="sm" variant="secondary" onClick={() => act("unsuspend")}>
              Reinstate
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
