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
  AdminPartnerRole,
  DOCUMENT_TYPE_LABELS,
  PartnerRoleStatus,
  ROLE_LABELS,
} from "@/types/partner";

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
    </div>
  );
}

function RoleReviewCard({ role, onChange }: { role: AdminPartnerRole; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            {ROLE_LABELS[role.role_type]} — {role.applicant.full_name}
          </h3>
          <p className="text-xs text-zinc-500">{role.applicant.email ?? role.applicant.phone}</p>
        </div>
        {role.status === "pending" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={approve} loading={busy}>
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setShowReject((s) => !s)} disabled={busy}>
              Reject
            </Button>
          </div>
        )}
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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {role.documents.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500">Documents</p>
          <ul className="mt-1 flex flex-col gap-1">
            {role.documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 text-xs">
                <button
                  onClick={() => viewDocument(doc.id, doc.file_name)}
                  className="font-medium text-primary-600 underline hover:text-primary-700 dark:text-primary-400"
                >
                  {DOCUMENT_TYPE_LABELS[doc.document_type]} — {doc.file_name}
                </button>
                <Badge>{doc.status}</Badge>
                {doc.status === "pending" && (
                  <button onClick={() => verifyDocument(doc.id)} className="font-medium text-emerald-600 underline hover:text-emerald-700">
                    Mark verified
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
