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

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { TourStatus } from "@/types/tour";

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

interface AdminTour {
  id: string;
  local_expert_role_id: string;
  title: string;
  slug: string;
  description: string | null;
  short_summary?: string | null;
  duration_days: number;
  duration_nights?: number | null;
  base_price: string;
  currency?: string;
  tour_type?: string | null;
  status: TourStatus;
  rejection_reason: string | null;
  created_at: string;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  pickup_time?: string | null;
  dropoff_time?: string | null;
  pickup_coordinates?: { lat?: number; lng?: number } | null;
  nearest_hospital?: string | null;
  emergency_contact_phone?: string | null;
  permit_requirements?: string | null;
  first_aid_available?: boolean;
  insurance_included?: boolean;
  has_high_risk_activities?: boolean;
  expert_is_trusted?: boolean;
  applicant: { full_name: string; email: string | null; phone: string | null };
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
                          lat: tour.pickup_coordinates?.lat ?? 23.8103,
                          lng: tour.pickup_coordinates?.lng ?? 90.4125,
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

          {/* Safety & Emergency Profile */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Safety & Emergency Profile
            </h4>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-600 dark:text-zinc-400">
              <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Nearest Hospital:</span> {tour.nearest_hospital ?? "Not specified"}</p>
              <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Emergency Phone:</span> {tour.emergency_contact_phone ?? "Not specified"}</p>
              <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Permit Requirements:</span> {tour.permit_requirements ?? "None"}</p>
              <p><span className="font-medium text-zinc-800 dark:text-zinc-200">First-Aid Kit:</span> {tour.first_aid_available ? "✓ Certified responder on tour" : "Not equipped"}</p>
            </div>
          </div>

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
