"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileCheck2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
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
import type { VehicleStatus } from "@/types/rentcar";

interface AdminVehicleDoc {
  id: string;
  document_type: string;
  file_name: string;
  status: string;
  expiry_date?: string | null;
}

interface AdminVehicle {
  id: string;
  rent_a_car_role_id?: string;
  make: string;
  model: string;
  year: number;
  vehicle_type?: string | null;
  transmission?: string | null;
  seats?: number;
  price_per_day?: string;
  with_driver?: boolean;
  description?: string | null;
  status: VehicleStatus;
  rejection_reason: string | null;
  created_at?: string;
  applicant: { full_name: string; email: string | null; phone: string | null };
  vehicle_documents?: AdminVehicleDoc[];
}

const TABS: VehicleStatus[] = ["pending_review", "published", "suspended", "rejected", "draft"];

export default function AdminVehiclesPage() {
  const [tab, setTab] = useState<VehicleStatus>("pending_review");
  const queryClient = useQueryClient();

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["admin-vehicles", tab],
    queryFn: () => apiClient.get<AdminVehicle[]>(`/api/v1/admin/vehicles?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-vehicles"] });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Vehicle Approvals & Fleet Moderation</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review submitted rental vehicles, registration papers, fitness certificates, and fleet operator credentials.
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
      {!isLoading && (vehicles ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab.replace(/_/g, " ")} vehicles`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {(vehicles ?? []).map((vehicle) => (
          <VehicleReviewCard key={vehicle.id} vehicle={vehicle} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function VehicleReviewCard({ vehicle, onChange }: { vehicle: AdminVehicle; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/vehicles/${vehicle.id}/approve`, undefined, { auth: true });
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
      await apiClient.post(`/api/v1/admin/vehicles/${vehicle.id}/reject`, { reason: rejectReason }, { auth: true });
      setShowReject(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  };

  const suspend = async () => {
    if (!suspendReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/vehicles/${vehicle.id}/suspend`, { reason: suspendReason }, { auth: true });
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
      await apiClient.post(`/api/v1/admin/vehicles/${vehicle.id}/unsuspend`, undefined, { auth: true });
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
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {vehicle.make} {vehicle.model} ({vehicle.year})
            </h3>
            <Badge variant={vehicle.status === "published" ? "success" : vehicle.status === "suspended" ? "danger" : "neutral"} className="capitalize text-xs">
              {vehicle.status.replace(/_/g, " ")}
            </Badge>
            {vehicle.vehicle_type && (
              <Badge variant="accent" className="capitalize text-xs">
                {vehicle.vehicle_type}
              </Badge>
            )}
            {vehicle.with_driver && (
              <Badge variant="neutral" className="text-xs">
                With Driver
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {vehicle.seats ?? 4} Seats · {vehicle.transmission ?? "Manual"} ·{" "}
            {vehicle.price_per_day && (
              <>
                Rate: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatMoney(vehicle.price_per_day)}/day</span> ·{" "}
              </>
            )}
            Fleet Owner: <span className="font-medium text-zinc-800 dark:text-zinc-200">{vehicle.applicant.full_name}</span> ({vehicle.applicant.email ?? vehicle.applicant.phone})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowDetails((v) => !v)} className="text-xs">
            {showDetails ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {showDetails ? "Hide Application" : "View Application & Docs"}
          </Button>

          {vehicle.status === "pending_review" && (
            <>
              <Button size="sm" onClick={approve} loading={busy}>
                Approve Vehicle
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setShowReject((s) => !s)} disabled={busy}>
                Reject
              </Button>
            </>
          )}

          {vehicle.status === "published" && (
            <Button size="sm" variant="destructive" onClick={() => setShowSuspend((s) => !s)} disabled={busy}>
              <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Suspend Vehicle
            </Button>
          )}

          {vehicle.status === "suspended" && (
            <Button size="sm" variant="secondary" onClick={unsuspend} loading={busy}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Reinstate Vehicle
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
            placeholder="Reason for vehicle rejection..."
            className="flex-1"
          />
          <Button size="sm" variant="destructive" onClick={reject} disabled={busy || !rejectReason.trim()}>
            Confirm Reject
          </Button>
        </div>
      )}

      {showSuspend && (
        <div className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
          <Input
            type="text"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Reason for vehicle suspension (fitness expiry, route permit issue, accident)..."
            className="flex-1"
          />
          <Button size="sm" variant="destructive" onClick={suspend} disabled={busy || !suspendReason.trim()}>
            Confirm Suspend
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      {vehicle.rejection_reason && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
          <span className="font-semibold">Reason recorded:</span> {vehicle.rejection_reason}
        </p>
      )}

      {/* Expanded Vehicle Application Details & Attested Documents */}
      {showDetails && (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="text-zinc-500 font-medium">Vehicle Specifications</p>
              <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{vehicle.make} {vehicle.model} ({vehicle.year})</p>
              <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">Type: {vehicle.vehicle_type ?? "Sedan"}</p>
              <p className="text-zinc-600 dark:text-zinc-400">Transmission: {vehicle.transmission ?? "Manual"}</p>
              <p className="text-zinc-600 dark:text-zinc-400">Seating Capacity: {vehicle.seats ?? 4} Pax</p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="text-zinc-500 font-medium">Rental Terms & Rates</p>
              <p className="mt-1 font-semibold text-emerald-600">
                {vehicle.price_per_day ? formatMoney(vehicle.price_per_day) : "Negotiable"} / day
              </p>
              <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                Driver Option: {vehicle.with_driver ? "✓ Dedicated driver included" : "Self-drive rental"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="text-zinc-500 font-medium">Fleet Operator Identity</p>
              <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{vehicle.applicant.full_name}</p>
              <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">Email: {vehicle.applicant.email ?? "None"}</p>
              <p className="text-zinc-600 dark:text-zinc-400">Phone: {vehicle.applicant.phone ?? "None"}</p>
            </div>
          </div>

          {vehicle.description && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">Listing Description:</span>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{vehicle.description}</p>
            </div>
          )}

          {/* Fleet Attested Verification Documents */}
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              <FileCheck2 className="h-3.5 w-3.5 text-primary-600" /> Fleet Attested Verification Documents
            </h4>
            {(!vehicle.vehicle_documents || vehicle.vehicle_documents.length === 0) ? (
              <p className="mt-1 text-xs text-zinc-400">No verification documents uploaded for this rent-a-car role.</p>
            ) : (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {vehicle.vehicle_documents.map((doc) => (
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
