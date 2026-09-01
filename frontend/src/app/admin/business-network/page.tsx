"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  AdminBusinessReferral,
  OWNERSHIP_TYPE_LABELS,
  REFERRAL_STATUS_LABELS,
  ReferralStatus,
} from "@/types/business-network";

const TABS: ReferralStatus[] = ["pending", "approved", "rejected"];

export default function AdminBusinessNetworkPage() {
  const [tab, setTab] = useState<ReferralStatus>("pending");
  const queryClient = useQueryClient();

  const { data: referrals, isLoading } = useQuery({
    queryKey: ["admin-business-network", tab],
    queryFn: () =>
      apiClient.get<AdminBusinessReferral[]>(`/api/v1/admin/business-network?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-business-network"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Business Referrals</h1>

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
            {REFERRAL_STATUS_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && (referrals ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab} referrals`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(referrals ?? []).map((r) => (
          <ReferralCard key={r.id} referral={r} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function ReferralCard({ referral, onChange }: { referral: AdminBusinessReferral; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [partnerRoleId, setPartnerRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linkPartner = async () => {
    if (!partnerRoleId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(
        `/api/v1/admin/business-network/${referral.id}/link-partner`,
        { partner_role_id: partnerRoleId },
        { auth: true }
      );
      setShowLink(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link partner");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/business-network/${referral.id}/approve`, undefined, { auth: true });
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
        `/api/v1/admin/business-network/${referral.id}/reject`,
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

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{referral.business_name}</h3>
          <p className="text-xs text-zinc-500">
            {referral.business_type} · {OWNERSHIP_TYPE_LABELS[referral.ownership_type]} · Referred by{" "}
            {referral.referring_expert_name}
          </p>
        </div>
        {referral.status === "pending" && (
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

      {referral.description && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{referral.description}</p>}
      {(referral.contact_phone || referral.contact_email) && (
        <p className="mt-1 text-xs text-zinc-500">
          {referral.contact_phone} {referral.contact_phone && referral.contact_email && "·"} {referral.contact_email}
        </p>
      )}

      {referral.status === "approved" && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {referral.linked_partner_role_id ? (
            <p className="text-xs text-emerald-600">
              Linked to partner {referral.linked_partner_role_id.slice(0, 8)} — network commission active
            </p>
          ) : !showLink ? (
            <button onClick={() => setShowLink(true)} className="text-xs font-medium text-primary-600 underline hover:text-primary-700 dark:text-primary-400">
              Link to a registered partner
            </button>
          ) : (
            <div className="flex gap-2">
              <Input value={partnerRoleId} onChange={(e) => setPartnerRoleId(e.target.value)} placeholder="Partner role ID" className="flex-1" />
              <Button size="sm" onClick={linkPartner} disabled={busy || !partnerRoleId.trim()}>
                Link
              </Button>
            </div>
          )}
        </div>
      )}

      {showReject && (
        <div className="mt-3 flex gap-2">
          <Input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason" className="flex-1" />
          <Button size="sm" variant="destructive" onClick={reject} disabled={busy || !rejectReason.trim()}>
            Confirm
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {referral.status === "rejected" && referral.rejection_reason && (
        <p className="mt-2 text-xs text-red-600">Reason: {referral.rejection_reason}</p>
      )}
    </Card>
  );
}
