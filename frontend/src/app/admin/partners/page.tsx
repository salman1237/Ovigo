"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  isExpired,
  isExpiringSoon,
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Partner Approvals</h1>

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
            {t}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && (roles ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab} applications`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(roles ?? []).map((role) => (
          <RoleReviewCard key={role.id} role={role} onChange={refetch} />
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

function RoleReviewCard({ role, onChange }: { role: AdminPartnerRole; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            {ROLE_LABELS[role.role_type]} — {role.applicant.full_name}
          </h3>
          <p className="text-xs text-zinc-500">
            {role.applicant.email ?? role.applicant.phone}
            {!role.applicant.is_active && <span className="ml-2 font-medium text-red-600">Account suspended</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {role.status === "pending" && (
            <>
              <Button size="sm" onClick={approve} loading={busy}>
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setShowReject((s) => !s)} disabled={busy}>
                Reject
              </Button>
            </>
          )}
          {role.status === "approved" && (
            <Button size="sm" variant="destructive" onClick={() => setShowSuspend((s) => !s)} disabled={busy}>
              Suspend role
            </Button>
          )}
          {role.status === "suspended" && (
            <Button size="sm" variant="secondary" onClick={unsuspend} loading={busy}>
              Reinstate role
            </Button>
          )}
        </div>
      </div>

      {showReject && (
        <div className="mt-3 flex gap-2">
          <Input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason"
            className="flex-1"
          />
          <Button size="sm" variant="destructive" onClick={reject} disabled={busy || !rejectReason.trim()}>
            Confirm
          </Button>
        </div>
      )}

      {showSuspend && (
        <div className="mt-3 flex gap-2">
          <Input
            type="text"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Suspension reason"
            className="flex-1"
          />
          <Button size="sm" variant="destructive" onClick={suspend} disabled={busy || !suspendReason.trim()}>
            Confirm
          </Button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={toggleAccount}
          disabled={busy}
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {role.applicant.is_active ? "Suspend entire account" : "Reactivate account"}
        </button>
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {showHistory ? "Hide" : "Show"} verification history
        </button>
      </div>

      {showHistory && <VerificationHistory entityType="partner_role" entityId={role.id} />}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {role.documents.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500">Documents</p>
          <ul className="mt-1 flex flex-col gap-1">
            {role.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  onClick={() => viewDocument(doc.id, doc.file_name)}
                  className="font-medium text-primary-600 underline hover:text-primary-700 dark:text-primary-400"
                >
                  {DOCUMENT_TYPE_LABELS[doc.document_type]} — {doc.file_name}
                </button>
                {doc.expiry_date && <span className="text-zinc-400">expires {doc.expiry_date}</span>}
                <Badge>{doc.status}</Badge>
                {doc.status === "verified" && isExpired(doc.expiry_date) && <Badge variant="danger">Expired</Badge>}
                {doc.status === "verified" && !isExpired(doc.expiry_date) && isExpiringSoon(doc.expiry_date) && (
                  <Badge variant="warning">Expiring soon</Badge>
                )}
                {doc.status === "pending" && (
                  <button onClick={() => verifyDocument(doc.id)} className="font-medium text-emerald-600 underline hover:text-emerald-700">
                    Mark verified
                  </button>
                )}
                {doc.status === "verified" && (isExpired(doc.expiry_date) || isExpiringSoon(doc.expiry_date)) && (
                  <button onClick={() => requestReverification(doc.id)} className="font-medium text-amber-600 underline hover:text-amber-700">
                    Request re-verification
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
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
    <div className="mt-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      {isLoading && <Spinner />}
      {!isLoading && (logs ?? []).length === 0 && <p className="text-xs text-zinc-400">No history yet.</p>}
      <ul className="flex flex-col gap-1">
        {(logs ?? []).map((log) => (
          <li key={log.id} className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{log.action}</span> —{" "}
            {new Date(log.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
