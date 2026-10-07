"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileCheck2,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
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
import {
  AdminExpiringDocument,
  AdminPartnerRole,
  DOCUMENT_TYPE_LABELS,
  DocumentType,
  isExpired,
  isExpiringSoon,
  PartnerRoleApplication,
  PartnerRoleStatus,
  ROLE_LABELS,
} from "@/types/partner";
import type { AuditLog } from "@/types/audit";

const TABS: PartnerRoleStatus[] = ["pending", "approved", "rejected", "suspended"];

export default function AdminPartnersPage() {
  const [tab, setTab] = useState<PartnerRoleStatus>("pending");
  const queryClient = useQueryClient();

  const { data: roles, isLoading } = useQuery({
    queryKey: ["admin-partner-roles", tab],
    queryFn: () =>
      apiClient.get<AdminPartnerRole[]>(`/api/v1/admin/partners/roles?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-partner-roles"] });

  const { data: documentRequirements } = useQuery({
    queryKey: ["partner-document-requirements"],
    queryFn: () => apiClient.get<Record<string, DocumentType[]>>("/api/v1/partners/document-requirements"),
    staleTime: Infinity,
  });

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Partner Applications & Moderation</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review detailed partner applications, verify attested legal & commercial documents, and manage role suspensions.
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-all",
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      )}
      {!isLoading && (roles ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab} partner applications`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(roles ?? []).map((role) => (
          <RoleReviewCard
            key={role.id}
            role={role}
            onChange={refetch}
            requiredDocumentTypes={documentRequirements?.[role.role_type] ?? []}
          />
        ))}
      </div>

      <ExpiringDocuments />
    </div>
  );
}

function ExpiringDocuments() {
  const { data: documents } = useQuery({
    queryKey: ["admin-partner-roles", "expiring-documents"],
    queryFn: () =>
      apiClient.get<AdminExpiringDocument[]>("/api/v1/admin/partners/documents/expiring?within_days=30", { auth: true }),
  });

  if (!documents || documents.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Documents expiring soon or expired</h2>
      <Card className="mt-2 flex flex-col gap-2 p-4">
        {documents.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{d.applicant.full_name}</span>
            <span className="text-zinc-400">({ROLE_LABELS[d.role_type]})</span>
            <span>{DOCUMENT_TYPE_LABELS[d.document_type]}</span>
            <Badge variant={isExpired(d.expiry_date) ? "danger" : "warning"}>
              {isExpired(d.expiry_date) ? "Expired" : "Expiring"} {d.expiry_date}
            </Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}

function RoleReviewCard({
  role,
  onChange,
  requiredDocumentTypes,
}: {
  role: AdminPartnerRole;
  onChange: () => void;
  requiredDocumentTypes: DocumentType[];
}) {
  const presentDocumentTypes = new Set(role.documents.map((d) => d.document_type));
  const missingDocumentTypes = requiredDocumentTypes.filter((dt) => !presentDocumentTypes.has(dt));
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const latestApplication = role.applications?.[0];
  const profile = role.profile_details;

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/partners/roles/${role.id}/approve`, undefined, { auth: true });
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
      await apiClient.post(
        `/api/v1/admin/partners/roles/${role.id}/reject`,
        { reason: rejectReason },
        { auth: true }
      );
      setShowReject(false);
      setRejectReason("");
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
      await apiClient.post(
        `/api/v1/admin/partners/roles/${role.id}/suspend`,
        { reason: suspendReason },
        { auth: true }
      );
      setShowSuspend(false);
      setSuspendReason("");
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
      await apiClient.post(`/api/v1/admin/partners/roles/${role.id}/unsuspend`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to unsuspend");
    } finally {
      setBusy(false);
    }
  };

  const toggleAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      const path = role.applicant.is_active
        ? `/api/v1/admin/users/${role.applicant.id}/suspend`
        : `/api/v1/admin/users/${role.applicant.id}/unsuspend`;
      await apiClient.post(path, role.applicant.is_active ? { reason: "Suspended from partner review" } : undefined, {
        auth: true,
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update account");
    } finally {
      setBusy(false);
    }
  };

  const toggleTrusted = async () => {
    const newValue = !profile?.is_trusted;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/experts/${role.id}/trusted`, { is_trusted: newValue }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update trusted status");
    } finally {
      setBusy(false);
    }
  };

  const viewDocument = async (documentId: string, fileName: string) => {
    const blob = await apiClient.getBlob(`/api/v1/admin/partners/documents/${documentId}/file`, { auth: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const verifyDocument = async (documentId: string) => {
    await apiClient.post(`/api/v1/admin/partners/documents/${documentId}/verify`, undefined, { auth: true });
    onChange();
  };

  const requestReverification = async (documentId: string) => {
    await apiClient.post(`/api/v1/admin/partners/documents/${documentId}/request-reverification`, undefined, { auth: true });
    onChange();
  };

  return (
    <Card className="overflow-hidden border border-zinc-200/80 p-5 shadow-sm dark:border-zinc-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                {role.applicant.full_name}
              </h3>
              <Badge variant="primary" className="font-medium">
                {ROLE_LABELS[role.role_type]}
              </Badge>
              {role.status === "approved" && (
                <Badge variant="success" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                  Approved
                </Badge>
              )}
              {role.status === "suspended" && (
                <Badge variant="danger" className="flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" /> Suspended
                </Badge>
              )}
              {role.status === "rejected" && <Badge variant="danger">Rejected</Badge>}
              {role.status === "pending" && <Badge variant="warning">Pending Review</Badge>}
              {role.status === "pending" && missingDocumentTypes.length > 0 && (
                <Badge variant="danger" title={missingDocumentTypes.map((dt) => DOCUMENT_TYPE_LABELS[dt]).join(", ")}>
                  Missing {missingDocumentTypes.length} required document{missingDocumentTypes.length > 1 ? "s" : ""}
                </Badge>
              )}
              {role.role_type === "local_expert" && profile?.is_trusted && (
                <Badge variant="success" className="flex items-center gap-1">
                  <Star className="h-3 w-3" /> Trusted Expert
                </Badge>
              )}
            </div>

            <p className="mt-1 text-xs text-zinc-500">
              {role.applicant.email ?? "No email"} • {role.applicant.phone ?? "No phone"} • Applied {new Date(role.created_at).toLocaleDateString()}
              {!role.applicant.is_active && (
                <span className="ml-2 font-semibold text-red-600 dark:text-red-400">
                  [Account Suspended]
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {role.status === "pending" && (
            <>
              <Button
                size="sm"
                onClick={approve}
                loading={busy}
                disabled={missingDocumentTypes.length > 0}
                title={missingDocumentTypes.length > 0 ? `Missing: ${missingDocumentTypes.map((dt) => DOCUMENT_TYPE_LABELS[dt]).join(", ")}` : undefined}
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                Approve Role
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setShowReject((s) => !s)} disabled={busy}>
                Reject
              </Button>
            </>
          )}
          {role.status === "approved" && (
            <Button size="sm" variant="destructive" onClick={() => setShowSuspend((s) => !s)} disabled={busy}>
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Suspend Role
            </Button>
          )}
          {role.status === "approved" && role.role_type === "local_expert" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={toggleTrusted}
              loading={busy}
              className={profile?.is_trusted ? "border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-950/20" : ""}
              title={profile?.is_trusted ? "Remove trusted status — future tours will require manual review" : "Mark as trusted expert — future tours without high-risk activities will auto-publish"}
            >
              <Star className="mr-1 h-3.5 w-3.5" />
              {profile?.is_trusted ? "Remove Trusted" : "Mark Trusted"}
            </Button>
          )}
          {role.status === "suspended" && (
            <Button size="sm" variant="secondary" onClick={unsuspend} loading={busy} className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Reinstate Role
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowDetails((s) => !s)}
            className="flex items-center gap-1 text-xs"
          >
            {showDetails ? "Hide Application" : "View Application & Docs"}
            {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {showReject && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
          <p className="text-xs font-semibold text-red-800 dark:text-red-300">Specify Rejection Reason</p>
          <div className="mt-2 flex gap-2">
            <Input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Incomplete business documents or unverified credentials"
              className="flex-1 bg-white text-xs dark:bg-zinc-900"
            />
            <Button size="sm" variant="destructive" onClick={reject} disabled={busy || !rejectReason.trim()}>
              Confirm Rejection
            </Button>
          </div>
        </div>
      )}

      {showSuspend && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
          <p className="text-xs font-semibold text-red-800 dark:text-red-300">Specify Role Suspension Reason</p>
          <div className="mt-2 flex gap-2">
            <Input
              type="text"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Policy breach, expired license, or safety complaint under review"
              className="flex-1 bg-white text-xs dark:bg-zinc-900"
            />
            <Button size="sm" variant="destructive" onClick={suspend} disabled={busy || !suspendReason.trim()}>
              Confirm Suspension
            </Button>
          </div>
        </div>
      )}

      {showDetails && (
        <div className="mt-5 space-y-4 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
          {latestApplication?.message && (
            <div className="rounded-xl border border-primary-200/60 bg-primary-50/40 p-3.5 dark:border-primary-900/40 dark:bg-primary-950/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-800 dark:text-primary-300">
                Application Statement
              </span>
              <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                &quot;{latestApplication.message}&quot;
              </p>
            </div>
          )}

          {latestApplication && <ApplicationFormDetails application={latestApplication} />}

          {profile && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Applicant Qualifications & Operational Profile
              </h4>
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                {profile.headline && (
                  <div className="col-span-full">
                    <span className="text-zinc-400">Headline: </span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{profile.headline}</span>
                  </div>
                )}
                {profile.bio && (
                  <div className="col-span-full">
                    <span className="text-zinc-400">Bio: </span>
                    <span className="text-zinc-700 dark:text-zinc-300">{profile.bio}</span>
                  </div>
                )}
                <div>
                  <span className="text-zinc-400">Experience: </span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {profile.years_experience != null ? `${profile.years_experience} Years` : "Not specified"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400">Languages: </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {profile.languages?.length ? profile.languages.join(", ") : "English"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400">Safety & First Aid: </span>
                  <span className={cn("font-medium", profile.emergency_handling_capability ? "text-emerald-600" : "text-amber-600")}>
                    {profile.emergency_handling_capability ? "First-Aid & Protocol Certified" : "Standard"}
                  </span>
                </div>
                {profile.emergency_contact_number && (
                  <div>
                    <span className="text-zinc-400">Emergency Phone: </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">{profile.emergency_contact_number}</span>
                  </div>
                )}
                {profile.expertise_categories && profile.expertise_categories.length > 0 && (
                  <div className="col-span-full flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-zinc-400">Expertise: </span>
                    {profile.expertise_categories.map((cat, idx) => (
                      <span key={idx} className="rounded-md bg-zinc-200/80 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
                {profile.secondary_destinations && profile.secondary_destinations.length > 0 && (
                  <div className="col-span-full flex flex-wrap items-center gap-1.5">
                    <span className="text-zinc-400">Operating Zones: </span>
                    {profile.secondary_destinations.map((dest, idx) => (
                      <span key={idx} className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        {dest}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attested Verification Documents */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-primary-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Attested Documents & Legal Compliance ({role.documents.length})
                </h4>
              </div>
              <span className="text-[11px] text-zinc-400">Click to preview or download signed attestation</span>
            </div>

            {role.documents.length === 0 ? (
              <p className="mt-3 text-xs italic text-zinc-400">No verification documents attached yet.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {role.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col justify-between rounded-lg border border-zinc-200 bg-white p-3 shadow-xs dark:border-zinc-700/80 dark:bg-zinc-800/80"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                          {DOCUMENT_TYPE_LABELS[doc.document_type]}
                        </span>
                        <div className="flex items-center gap-1">
                          <Badge
                            variant={
                              doc.status === "verified"
                                ? "success"
                                : doc.status === "rejected"
                                ? "danger"
                                : "warning"
                            }
                            className="text-[10px] capitalize"
                          >
                            {doc.status}
                          </Badge>
                          {doc.status === "verified" && isExpired(doc.expiry_date) && (
                            <Badge variant="danger" className="text-[10px]">Expired</Badge>
                          )}
                          {doc.status === "verified" && !isExpired(doc.expiry_date) && isExpiringSoon(doc.expiry_date) && (
                            <Badge variant="warning" className="text-[10px]">Expiring soon</Badge>
                          )}
                        </div>
                      </div>

                      <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">
                        {doc.file_name}
                      </p>

                      {doc.expiry_date && (
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          Expiry: {doc.expiry_date}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-700/50">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => viewDocument(doc.id, doc.file_name)}
                        className="h-7 text-[11px] gap-1 px-2.5 text-primary-600 hover:text-primary-700"
                      >
                        <Download className="h-3 w-3" /> View / Download
                      </Button>

                      <div className="flex gap-2">
                        {doc.status === "pending" && (
                          <button
                            onClick={() => verifyDocument(doc.id)}
                            className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                          >
                            Mark Verified
                          </button>
                        )}
                        {doc.status === "verified" && (isExpired(doc.expiry_date) || isExpiringSoon(doc.expiry_date)) && (
                          <button
                            onClick={() => requestReverification(doc.id)}
                            className="text-[11px] font-medium text-amber-600 hover:text-amber-700 hover:underline"
                          >
                            Request Re-verify
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Account controls & History footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAccount}
            disabled={busy}
            className={cn(
              "font-medium underline hover:opacity-80 transition-opacity",
              role.applicant.is_active ? "text-zinc-500 hover:text-red-600" : "text-emerald-600 hover:text-emerald-700"
            )}
          >
            {role.applicant.is_active ? "Suspend entire account" : "Reactivate user account"}
          </button>
          <span>•</span>
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="font-medium underline hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            {showHistory ? "Hide audit trail" : "Audit & verification history"}
          </button>
        </div>
        <span className="text-[11px] text-zinc-400">Role ID: {role.id.slice(0, 8)}...</span>
      </div>

      {showHistory && <VerificationHistory entityType="partner_role" entityId={role.id} />}
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </Card>
  );
}

function ApplicationField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-zinc-400">{label}: </span>
      <span className="font-medium text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}

function humanizeKey(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function humanizeRoleDetailValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const items = value.filter((v) => v != null && v !== "");
    return items.length ? items.join(", ") : null;
  }
  return String(value);
}

function ApplicationFormDetails({ application }: { application: PartnerRoleApplication }) {
  const a = application;
  const hasIdentity = a.full_legal_name || a.contact_mobile_number || a.national_id_type || a.national_id_number;
  const hasAddress = a.permanent_address || a.current_address;
  const hasEmergency = a.emergency_contact_name || a.emergency_contact_phone;
  const hasPayout = a.payout_method || a.payout_provider_name || a.payout_account_name || a.payout_account_number || a.tax_id;
  const hasRoleDetails = a.role_details && Object.keys(a.role_details).length > 0;
  const hasAgreements = a.agreed_to_partner_terms != null || a.agreed_to_background_check != null;

  if (!hasIdentity && !hasAddress && !hasEmergency && !hasPayout && !hasRoleDetails && !hasAgreements) {
    return null;
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Application Form Details
      </h4>
      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
        <ApplicationField label="Full Legal Name" value={a.full_legal_name} />
        <ApplicationField label="Contact Mobile" value={a.contact_mobile_number} />
        <ApplicationField
          label="National ID"
          value={
            a.national_id_type || a.national_id_number
              ? `${a.national_id_type === "passport" ? "Passport" : a.national_id_type === "id_card" ? "ID Card" : ""}${a.national_id_number ? ` — ${a.national_id_number}` : ""}`
              : null
          }
        />
        <ApplicationField label="Permanent Address" value={a.permanent_address} />
        <ApplicationField label="Current Address" value={a.current_address} />
        <ApplicationField label="Emergency Contact" value={a.emergency_contact_name} />
        <ApplicationField label="Emergency Phone" value={a.emergency_contact_phone} />
        <ApplicationField
          label="Payout Method"
          value={a.payout_method === "bank" ? "Bank Transfer" : a.payout_method === "mobile_financial_service" ? "Mobile Financial Service" : null}
        />
        <ApplicationField label="Payout Provider" value={a.payout_provider_name} />
        <ApplicationField label="Payout Account Name" value={a.payout_account_name} />
        <ApplicationField label="Payout Account Number" value={a.payout_account_number} />
        <ApplicationField label="Tax ID" value={a.tax_id} />
        {hasAgreements && (
          <div className="col-span-full flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={a.agreed_to_partner_terms ? "success" : "danger"} className="text-[10px]">
              {a.agreed_to_partner_terms ? "Agreed to Partner Terms" : "Did Not Agree to Partner Terms"}
            </Badge>
            <Badge variant={a.agreed_to_background_check ? "success" : "danger"} className="text-[10px]">
              {a.agreed_to_background_check ? "Agreed to Background Check" : "Did Not Agree to Background Check"}
            </Badge>
          </div>
        )}
        {hasRoleDetails &&
          Object.entries(a.role_details as Record<string, unknown>).map(([key, value]) => (
            <ApplicationField key={key} label={humanizeKey(key)} value={humanizeRoleDetailValue(value)} />
          ))}
      </div>
    </div>
  );
}

function VerificationHistory({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin-audit-logs", entityType, entityId],
    queryFn: () =>
      apiClient.get<AuditLog[]>(`/api/v1/admin/audit-logs?entity_type=${entityType}&entity_id=${entityId}`, {
        auth: true,
      }),
  });

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30">
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Audit History</p>
      {isLoading && <Spinner />}
      {!isLoading && (logs ?? []).length === 0 && <p className="mt-1 text-xs text-zinc-400">No moderation events recorded.</p>}
      <ul className="mt-1.5 flex flex-col gap-1">
        {(logs ?? []).map((log) => (
          <li key={log.id} className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{log.action}</span> •{" "}
            {new Date(log.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
