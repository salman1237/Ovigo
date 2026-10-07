"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bus,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Star,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { DetailField, humanizeDetailValue, humanizeKey } from "@/components/admin/DetailField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { AdminUserSummary } from "@/types/partner";
import type { Tour, TourStatus } from "@/types/tour";

const RouteMap = dynamic(
  () => import("@/components/shared/RouteMap").then((m) => m.RouteMap),
  { ssr: false, loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" /> }
);

interface AdminTourDoc {
  id: string;
  document_type: string;
  file_name: string;
  status: string;
  expiry_date?: string | null;
}

interface AdminTour extends Tour {
  has_high_risk_activities?: boolean;
  expert_is_trusted?: boolean;
  applicant: AdminUserSummary;
  expert_documents?: AdminTourDoc[];
}

// "pending_review" is kept as a tab alongside "submitted_for_review" so any tour
// still in the pre-PRD-10.4 status (from before this status set existed) remains
// reachable — see tours/models.py's "Backward compatibility aliases".
const TABS: TourStatus[] = [
  "submitted_for_review",
  "pending_review",
  "changes_requested",
  "published",
  "suspended",
  "rejected",
  "draft",
];

export default function AdminToursPage() {
  const [tab, setTab] = useState<TourStatus>("submitted_for_review");
  const queryClient = useQueryClient();

  const { data: tours, isLoading } = useQuery({
    queryKey: ["admin-tours", tab],
    queryFn: () => apiClient.get<AdminTour[]>(`/api/v1/admin/tours?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-tours"] });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Tour Approvals & Moderation</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review detailed tour package submissions, inspected route maps, safety profiles, and expert attested documents.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {isLoading && <Spinner className="mt-8" />}
      {!isLoading && (tours ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab.replace(/_/g, " ")} tours`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {(tours ?? []).map((tour) => (
          <TourReviewCard key={tour.id} tour={tour} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function TourReviewCard({ tour, onChange }: { tour: AdminTour; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [changesReason, setChangesReason] = useState("");
  const [showRequestChanges, setShowRequestChanges] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSafetyChecklist, setShowSafetyChecklist] = useState(false);
  const [safetyChecks, setSafetyChecks] = useState([false, false, false]);
  const allSafetyChecked = safetyChecks.every(Boolean);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isHighRisk = !!tour.has_high_risk_activities;

  const approve = async (safetyConfirmed = false) => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(
        `/api/v1/admin/tours/${tour.id}/approve`,
        { safety_checklist_confirmed: safetyConfirmed },
        { auth: true }
      );
      setShowSafetyChecklist(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve");
    } finally {
      setBusy(false);
    }
  };

  const handleApproveClick = () => {
    if (isHighRisk) {
      setSafetyChecks([false, false, false]);
      setShowSafetyChecklist(true);
    } else {
      approve(false);
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/tours/${tour.id}/reject`, { reason: rejectReason }, { auth: true });
      setShowReject(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  };

  const requestChanges = async () => {
    if (!changesReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/tours/${tour.id}/request-changes`, { reason: changesReason }, { auth: true });
      setShowRequestChanges(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to request changes");
    } finally {
      setBusy(false);
    }
  };

  const suspend = async () => {
    if (!suspendReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/tours/${tour.id}/suspend`, { reason: suspendReason }, { auth: true });
      setShowSuspend(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to suspend");
    } finally {
      setBusy(false);
    }
  };

  const unsuspend = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/tours/${tour.id}/unsuspend`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reinstate");
    } finally {
      setBusy(false);
    }
  };

  const downloadDoc = async (docId: string, fileName: string) => {
    try {
      const blob = await apiClient.getBlob(`/api/v1/admin/partners/documents/${docId}/file`, { auth: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download document");
    }
  };

  return (
    <Card className="border border-zinc-200/90 shadow-sm transition-all hover:shadow-md dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{tour.title}</h3>
            <Badge variant={tour.status === "published" ? "success" : tour.status === "suspended" ? "danger" : "neutral"} className="capitalize text-xs">
              {tour.status.replace(/_/g, " ")}
            </Badge>
            {tour.tour_type && (
              <Badge variant="accent" className="capitalize text-xs">
                {tour.tour_type.replace(/_/g, " ")}
              </Badge>
            )}
            {isHighRisk && (
              <Badge variant="danger" className="flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" /> High-risk
              </Badge>
            )}
            {tour.expert_is_trusted && (
              <Badge variant="success" className="flex items-center gap-1 text-xs">
                <Star className="h-3 w-3" /> Trusted expert
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {tour.duration_days} Days{tour.duration_nights ? ` / ${tour.duration_nights} Nights` : ""} · Base Price:{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatMoney(tour.base_price)}</span> · Submitted by{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{tour.applicant.full_name}</span> ({tour.applicant.email ?? tour.applicant.phone})
          </p>
          {tour.short_summary && <p className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{tour.short_summary}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowDetails((v) => !v)} className="text-xs">
            {showDetails ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {showDetails ? "Hide Application" : "View Application & Docs"}
          </Button>

          {(tour.status === "pending_review" || tour.status === "submitted_for_review") && (
            <>
              <Button size="sm" onClick={handleApproveClick} loading={busy}>
                {isHighRisk ? <><AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-400" /> Approve (High-risk)</> : "Approve Tour"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowRequestChanges((s) => !s)} disabled={busy}>
                Request Changes
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setShowReject((s) => !s)} disabled={busy}>
                Reject
              </Button>
            </>
          )}

          {tour.status === "published" && (
            <Button size="sm" variant="destructive" onClick={() => setShowSuspend((s) => !s)} disabled={busy}>
              <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Suspend Tour
            </Button>
          )}

          {tour.status === "suspended" && (
            <Button size="sm" variant="secondary" onClick={unsuspend} loading={busy}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Reinstate Tour
            </Button>
          )}
        </div>
      </div>

      {showReject && (
        <div className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
          <Input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="flex-1"
          />
          <Button size="sm" variant="destructive" onClick={reject} disabled={busy || !rejectReason.trim()}>
            Confirm Reject
          </Button>
        </div>
      )}

      {showRequestChanges && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <Input
            type="text"
            value={changesReason}
            onChange={(e) => setChangesReason(e.target.value)}
            placeholder="What should the expert revise before resubmitting?"
            className="flex-1"
          />
          <Button size="sm" onClick={requestChanges} disabled={busy || !changesReason.trim()}>
            Confirm Request
          </Button>
        </div>
      )}

      {showSuspend && (
        <div className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
          <Input
            type="text"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Reason for suspension (safety risk, license issue, policy violation)..."
            className="flex-1"
          />
          <Button size="sm" variant="destructive" onClick={suspend} disabled={busy || !suspendReason.trim()}>
            Confirm Suspend
          </Button>
        </div>
      )}

      {showSafetyChecklist && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-700/60 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">High-risk safety checklist — required before approval</p>
          </div>
          <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {[
              "Insurance policy verified (public liability or equivalent)",
              "Required permits are present and valid",
              "A Level 2 certified guide is assigned for high-risk activities",
            ].map((item, idx) => (
              <label key={item} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safetyChecks[idx]}
                  onChange={(e) => setSafetyChecks((prev) => prev.map((v, i) => i === idx ? e.target.checked : v))}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-primary-600"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">Check all items to confirm you have reviewed the safety documentation.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => approve(true)} disabled={!allSafetyChecked || busy} loading={busy}>
              Confirm &amp; Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowSafetyChecklist(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      {tour.rejection_reason && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
          <span className="font-semibold">Reason recorded:</span> {tour.rejection_reason}
        </p>
      )}

      {/* Expanded Application Details & Attested Documents */}
      {showDetails && (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 space-y-4">
          {/* OpenStreetMap Route Display */}
          {(tour.pickup_location || tour.dropoff_location) && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                <Bus className="h-3.5 w-3.5" /> Transfer Route & Logistics (OpenStreetMap)
              </h4>
              <div className="mt-2">
                <RouteMap
                  pickup={
                    tour.pickup_location
                      ? {
                          label: tour.pickup_location,
                          lat: (tour.pickup_coordinates?.lat as number | undefined) ?? 23.8103,
                          lng: (tour.pickup_coordinates?.lng as number | undefined) ?? 90.4125,
                        }
                      : null
                  }
                  dropoff={
                    tour.dropoff_location
                      ? {
                          label: tour.dropoff_location,
                          lat: 21.4272,
                          lng: 91.9702,
                        }
                      : null
                  }
                  interactive={false}
                  height="h-56"
                />
              </div>
            </div>
          )}

          {/* Pricing & Inclusions */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Pricing & Inclusions</h4>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              <DetailField label="Child Price" value={tour.child_price ? formatMoney(tour.child_price) : null} />
              <DetailField label="Infant Price" value={tour.infant_price ? formatMoney(tour.infant_price) : null} />
              <DetailField label="Price Per Group" value={tour.price_per_group ? formatMoney(tour.price_per_group) : null} />
              <DetailField label="Single Room Supplement" value={tour.single_room_supplement ? formatMoney(tour.single_room_supplement) : null} />
              <DetailField label="Couple Price" value={tour.couple_price ? formatMoney(tour.couple_price) : null} />
              <DetailField label="Weekend Price" value={tour.weekend_price ? formatMoney(tour.weekend_price) : null} />
              <DetailField label="Early Bird Discount" value={tour.early_bird_discount} />
              <DetailField label="Group Discount" value={tour.group_discount} />
              <DetailField label="Tax Rate" value={tour.tax_rate ? `${tour.tax_rate}%` : null} />
              <DetailField label="Service Charge Rate" value={tour.service_charge_rate ? `${tour.service_charge_rate}%` : null} />
              <DetailField label="Deposit Percentage" value={tour.deposit_percentage ? `${tour.deposit_percentage}%` : null} />
              <DetailField label="Payment Deadline" value={tour.payment_deadline_days ? `${tour.payment_deadline_days} days before departure` : null} />
              <DetailField label="Included Services" value={humanizeDetailValue(tour.included_services)} />
              <DetailField label="Excluded Services" value={humanizeDetailValue(tour.excluded_services)} />
            </div>
          </div>

          {/* Pickup & Drop-off */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Pickup & Drop-off</h4>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              <DetailField label="Pickup Window" value={tour.pickup_window} />
              <DetailField label="Pickup Contact Person" value={tour.pickup_contact_person} />
              <DetailField label="Home/Hotel Pickup Available" value={humanizeDetailValue(tour.home_hotel_pickup_available)} />
              <DetailField label="Home Pickup Extra Charge" value={tour.home_pickup_extra_charge ? formatMoney(tour.home_pickup_extra_charge) : null} />
              <DetailField label="Late Arrival Policy" value={tour.late_arrival_policy} />
            </div>
          </div>

          {/* Safety & Emergency Profile */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Safety & Emergency Profile
            </h4>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-zinc-600 dark:text-zinc-400">
              <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Nearest Hospital:</span> {tour.nearest_hospital ?? "Not specified"}</p>
              <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Emergency Phone:</span> {tour.emergency_contact_phone ?? "Not specified"}</p>
              <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Permit Requirements:</span> {tour.permit_requirements ?? "None"}</p>
              <p><span className="font-medium text-zinc-800 dark:text-zinc-200">First-Aid Kit:</span> {tour.first_aid_available ? "✓ Certified responder on tour" : "Not equipped"}</p>
              <DetailField label="Women Safety Notes" value={tour.women_safety_notes} />
              <DetailField label="Child Safety Notes" value={tour.child_safety_notes} />
              <DetailField label="Night Travel Policy" value={tour.night_travel_policy} />
              <DetailField label="Insurance Included" value={humanizeDetailValue(tour.insurance_included)} />
              <DetailField label="Emergency Procedure" value={tour.emergency_procedure} />
              <DetailField label="Weather Risk Note" value={tour.weather_risk_note} />
              <DetailField label="Activity Risk Note" value={tour.activity_risk_note} />
            </div>
          </div>

          {/* Policies */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Policies</h4>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              <DetailField label="Cancellation Policy" value={tour.cancellation_policy} />
              <DetailField label="Refund Policy" value={tour.refund_policy} />
              <DetailField label="Child Policy" value={tour.child_policy} />
              <DetailField label="Rescheduling Policy" value={tour.rescheduling_policy} />
              <DetailField label="Minimum Participant Policy" value={tour.min_participant_policy} />
              <DetailField label="Bad Weather Policy" value={tour.bad_weather_policy} />
              <DetailField label="No-Show Policy" value={tour.no_show_policy} />
              <DetailField label="Pet Policy" value={tour.pet_policy} />
              <DetailField label="Accessibility Policy" value={tour.accessibility_policy} />
              <DetailField label="Traveler Conduct Policy" value={tour.traveler_conduct_policy} />
            </div>
          </div>

          {/* Itinerary, Departures, Meals, Activities, Addons, Transport, Stays */}
          <TourNestedCollections tour={tour} />

          {/* Local Expert Attested Documents */}
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              <FileText className="h-3.5 w-3.5 text-primary-600" /> Expert Attested Verification Documents
            </h4>
            {(!tour.expert_documents || tour.expert_documents.length === 0) ? (
              <p className="mt-1 text-xs text-zinc-400">No verification documents uploaded for this expert role.</p>
            ) : (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tour.expert_documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-medium truncate text-zinc-800 dark:text-zinc-200">{doc.file_name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <Badge variant={doc.status === "verified" ? "success" : "neutral"} className="text-[10px] py-0 px-1.5 capitalize">
                          {doc.status}
                        </Badge>
                        <span className="text-[10px] text-zinc-400 uppercase">{doc.document_type.replace(/_/g, " ")}</span>
                        {doc.expiry_date && <span className="text-[10px] text-zinc-400">Exp: {doc.expiry_date}</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadDoc(doc.id, doc.file_name)}
                      className="shrink-0 h-7 px-2 text-xs"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> View/Download
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function TourNestedCollections({ tour }: { tour: AdminTour }) {
  const hasAny =
    tour.itinerary.length > 0 ||
    tour.departures.length > 0 ||
    tour.meals.length > 0 ||
    tour.activities.length > 0 ||
    tour.addons.length > 0 ||
    tour.transport.length > 0 ||
    tour.stays.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {tour.itinerary.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Itinerary ({tour.itinerary.length} day{tour.itinerary.length > 1 ? "s" : ""})
          </h4>
          <ol className="mt-2 space-y-1.5">
            {tour.itinerary
              .slice()
              .sort((a, b) => a.day_number - b.day_number)
              .map((day) => (
                <li key={day.id} className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">Day {day.day_number}: {day.title}</span>
                  {day.location_name && <span className="text-zinc-400"> — {day.location_name}</span>}
                  {day.description && <p className="mt-0.5">{day.description}</p>}
                </li>
              ))}
          </ol>
        </div>
      )}

      {tour.departures.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Departures ({tour.departures.length})
          </h4>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tour.departures.map((d) => (
              <div key={d.id} className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="font-medium text-zinc-800 dark:text-zinc-200">
                  {d.departure_date}{d.return_date ? ` → ${d.return_date}` : ""}
                </p>
                <p className="text-zinc-500">
                  {d.available_seats} seats available · {d.status}
                  {d.price_override ? ` · ${formatMoney(d.price_override)}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tour.meals.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Meals ({tour.meals.length})</h4>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {tour.meals.map((m) => (
              <Badge key={m.id} variant="neutral" className="capitalize text-[11px]">
                {m.meal_type}{m.day_number ? ` (Day ${m.day_number})` : ""}
              </Badge>
            ))}
          </ul>
        </div>
      )}

      {tour.activities.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Activities ({tour.activities.length})
          </h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tour.activities.map((a) => (
              <Badge key={a.id} variant={a.is_high_risk ? "danger" : "neutral"} className="text-[11px]">
                {a.name}{a.is_high_risk ? " ⚠" : ""}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {tour.addons.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Add-ons ({tour.addons.length})</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tour.addons.map((a) => (
              <Badge key={a.id} variant="accent" className="text-[11px]">
                {a.name} — {formatMoney(a.price)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {tour.transport.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Transport ({tour.transport.length})
          </h4>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tour.transport.map((t) => (
              <div key={t.id} className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="font-medium capitalize text-zinc-800 dark:text-zinc-200">{t.mode}{t.vehicle_type ? ` — ${t.vehicle_type}` : ""}</p>
                {t.description && <p className="text-zinc-500">{t.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tour.stays.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Included Stays ({tour.stays.length})
          </h4>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tour.stays.map((s) => (
              <div key={s.id} className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="font-medium text-zinc-800 dark:text-zinc-200">
                  {s.stay_name ?? "Stay"} — {s.nights} night{s.nights > 1 ? "s" : ""}
                </p>
                <p className="text-zinc-500">
                  {[s.property_type, s.room_category].filter(Boolean).map((v) => humanizeKey(String(v))).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
