"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
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
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {REFERRAL_STATUS_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (referrals ?? []).length === 0 && (
        <p className="mt-6 text-sm text-zinc-400">No {tab} referrals.</p>
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
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
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
            <button
              onClick={approve}
              disabled={busy}
              className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => setShowReject((s) => !s)}
              disabled={busy}
              className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
            >
              Reject
            </button>
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
            <button onClick={() => setShowLink(true)} className="text-xs font-medium text-zinc-900 underline dark:text-zinc-50">
              Link to a registered partner
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                value={partnerRoleId}
                onChange={(e) => setPartnerRoleId(e.target.value)}
                placeholder="Partner role ID"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                onClick={linkPartner}
                disabled={busy || !partnerRoleId.trim()}
                className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
              >
                Link
              </button>
            </div>
          )}
        </div>
      )}

      {showReject && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={reject}
            disabled={busy || !rejectReason.trim()}
            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {referral.status === "rejected" && referral.rejection_reason && (
        <p className="mt-2 text-xs text-red-600">Reason: {referral.rejection_reason}</p>
      )}
    </div>
  );
}
