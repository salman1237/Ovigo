"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { DetailField, humanizeDetailValue } from "@/components/admin/DetailField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { propertyImageUrl } from "@/lib/media";
import { AMENITY_LABELS, PROPERTY_TYPE_LABELS, type Property, type PropertyStatus } from "@/types/stay";
import type { AdminUserSummary } from "@/types/partner";

interface AdminProperty extends Property {
  applicant: AdminUserSummary;
}

const TABS: PropertyStatus[] = ["pending_review", "published", "rejected", "draft"];

export default function AdminPropertiesPage() {
  const [tab, setTab] = useState<PropertyStatus>("pending_review");
  const queryClient = useQueryClient();

  const { data: properties, isLoading } = useQuery({
    queryKey: ["admin-properties", tab],
    queryFn: () => apiClient.get<AdminProperty[]>(`/api/v1/admin/properties?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-properties"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Property Approvals</h1>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && (properties ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab.replace("_", " ")} properties`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(properties ?? []).map((prop) => (
          <PropertyReviewCard key={prop.id} property={prop} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function PropertyReviewCard({ property, onChange }: { property: AdminProperty; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/properties/${property.id}/approve`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/properties/${property.id}/reject`, { reason: rejectReason }, { auth: true });
      setShowReject(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border border-zinc-200/90 shadow-sm transition-all hover:shadow-md dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{property.name}</h3>
            <Badge variant={property.status === "published" ? "success" : "neutral"} className="capitalize text-xs">
              {property.status.replace(/_/g, " ")}
            </Badge>
            <Badge variant="accent" className="text-xs">{PROPERTY_TYPE_LABELS[property.property_type]}</Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            by <span className="font-medium text-zinc-800 dark:text-zinc-200">{property.applicant.full_name}</span>{" "}
            ({property.applicant.email ?? property.applicant.phone ?? "No contact"})
          </p>
          {property.description && <p className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{property.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowDetails((v) => !v)} className="text-xs">
            {showDetails ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {showDetails ? "Hide Application" : "View Application & Docs"}
          </Button>
          {property.status === "pending_review" && (
            <>
              <Button size="sm" onClick={approve} loading={busy}>
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setShowReject((s) => !s)} disabled={busy}>
                Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {showReject && (
        <div className="mt-3 flex gap-2">
          <Input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason" className="flex-1" />
          <Button size="sm" variant="destructive" onClick={reject} disabled={!rejectReason.trim()}>
            Confirm
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      {property.rejection_reason && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
          <span className="font-semibold">Reason recorded:</span> {property.rejection_reason}
        </p>
      )}

      {showDetails && (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Policies & Terms</h4>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              <DetailField label="Check-in Time" value={property.check_in_time} />
              <DetailField label="Check-out Time" value={property.check_out_time} />
              <DetailField label="Children Allowed" value={humanizeDetailValue(property.children_allowed)} />
              <DetailField label="Pets Allowed" value={humanizeDetailValue(property.pets_allowed)} />
              <DetailField label="Tax Rate" value={property.tax_rate ? `${property.tax_rate}%` : null} />
              <DetailField label="Service Charge Rate" value={property.service_charge_rate ? `${property.service_charge_rate}%` : null} />
              <DetailField label="Cancellation Policy" value={property.cancellation_policy} />
              <DetailField label="House Rules" value={property.house_rules} />
            </div>
          </div>

          {property.amenities.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Amenities ({property.amenities.length})
              </h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {property.amenities.map((a, idx) => (
                  <Badge key={idx} variant="neutral" className="text-[11px]">
                    {AMENITY_LABELS[a.amenity] ?? a.amenity}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {property.room_types.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Room Types ({property.room_types.length})
              </h4>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {property.room_types.map((rt) => (
                  <div key={rt.id} className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">{rt.name}</p>
                    <p className="mt-0.5 text-zinc-500">
                      {formatMoney(rt.base_price)}/night · Max {rt.max_occupancy} guests · {rt.total_units} unit{rt.total_units > 1 ? "s" : ""}
                      {rt.min_stay_nights ? ` · Min stay ${rt.min_stay_nights} night${rt.min_stay_nights > 1 ? "s" : ""}` : ""}
                    </p>
                    {rt.description && <p className="mt-0.5 text-zinc-500">{rt.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {property.images.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Images ({property.images.length})
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {property.images.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={propertyImageUrl(property.id, img.id)}
                    alt=""
                    className="h-20 w-28 rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
