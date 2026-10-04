"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { ROLE_LABELS } from "@/types/partner";
import {
  MEMBER_STATUS_LABELS,
  MEMBER_STATUS_VARIANTS,
  SOURCE_LABELS,
  type AdminNetworkAttribution,
  type NetworkMemberStatus,
} from "@/types/referrals";

const TABS: (NetworkMemberStatus | "all")[] = ["all", "pending", "active", "expired", "rejected", "revoked"];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default function AdminNetworkPage() {
  const [tab, setTab] = useState<NetworkMemberStatus | "all">("all");
  const queryClient = useQueryClient();

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ["admin-network-attributions", tab],
    queryFn: () =>
      apiClient.get<AdminNetworkAttribution[]>(
        `/api/v1/admin/network-attributions${tab === "all" ? "" : `?status=${tab}`}`,
        { auth: true }
      ),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-network-attributions"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Expert Networks</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Who referred whom. A Local Expert earns a network commission on an active member&apos;s bookings inside the
        commission window, capped at Ovigo&apos;s own commission on each booking.
      </p>

      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {t === "all" ? "All" : MEMBER_STATUS_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="Couldn't load network attributions." />}
      {!isLoading && !isError && (rows ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No network members here" />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(rows ?? []).map((r) => (
          <AttributionCard key={r.id} row={r} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

type Panel = "none" | "revoke" | "reassign" | "terms";

function AttributionCard({ row, onChange }: { row: AdminNetworkAttribution; onChange: () => void }) {
  const [panel, setPanel] = useState<Panel>("none");
  const [reason, setReason] = useState("");
  const [expertRoleId, setExpertRoleId] = useState("");
  const [ratePercent, setRatePercent] = useState(
    row.custom_commission_rate ? (Number(row.custom_commission_rate) * 100).toString() : ""
  );
  const [expiry, setExpiry] = useState(row.commission_expires_at ? row.commission_expires_at.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (path: string, body: unknown) => {
    setError(null);
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/admin/network-attributions/${row.id}/${path}`, body, { auth: true });
      setPanel("none");
      setReason("");
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const saveTerms = () => {
    const body: Record<string, unknown> = {};
    if (ratePercent.trim() === "") body.clear_custom_rate = true;
    else body.custom_commission_rate = (Number(ratePercent) / 100).toFixed(4);
    if (expiry) body.commission_expires_at = new Date(`${expiry}T23:59:59Z`).toISOString();
    run("terms", body);
  };

  const canAct = row.stored_status !== "revoked" && row.stored_status !== "rejected";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            {row.member_name}{" "}
            <span className="text-sm font-normal text-zinc-500">referred by</span> {row.referring_expert_name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {ROLE_LABELS[row.role_type]} · {SOURCE_LABELS[row.source]} · Joined {formatDate(row.created_at)}
          </p>
        </div>
        <Badge variant={MEMBER_STATUS_VARIANTS[row.status]}>{MEMBER_STATUS_LABELS[row.status]}</Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Window</dt>
          <dd className="font-medium text-zinc-800 dark:text-zinc-200">
            {formatDate(row.commission_starts_at)} – {formatDate(row.commission_expires_at)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Rate</dt>
          <dd className="font-medium text-zinc-800 dark:text-zinc-200">
            {row.custom_commission_rate ? `${(Number(row.custom_commission_rate) * 100).toFixed(2)}% (custom)` : "Network rule"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Terms accepted</dt>
          <dd className="font-medium text-zinc-800 dark:text-zinc-200">{formatDate(row.terms_accepted_at)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Network commission</dt>
          <dd className="font-medium text-zinc-800 dark:text-zinc-200">{formatMoney(row.total_network_commission)}</dd>
        </div>
      </dl>
      {row.revoked_reason && <p className="mt-2 text-xs text-red-600">Revoked: {row.revoked_reason}</p>}

      {canAct && panel === "none" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPanel("terms")}>
            Edit rate / expiry
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPanel("reassign")}>
            Reassign
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setPanel("revoke")}>
            Revoke
          </Button>
        </div>
      )}

      {panel === "terms" && (
        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 sm:flex-row sm:items-end dark:border-zinc-800">
          <Input
            label="Custom rate (%)"
            hint="Leave empty for the network rule"
            type="number"
            step="0.01"
            min="0"
            max="50"
            value={ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
          />
          <Input label="Expires on" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveTerms} loading={busy}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel("none")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(panel === "revoke" || panel === "reassign") && (
        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {panel === "reassign" && (
            <Input
              label="New expert's partner role ID"
              value={expertRoleId}
              onChange={(e) => setExpertRoleId(e.target.value)}
              placeholder="Approved Local Expert role ID"
            />
          )}
          <Input
            label="Reason (recorded in the audit log)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {panel === "revoke" && (
            <p className="text-xs text-zinc-500">Stops future earning and cancels this member&apos;s unpaid network commissions.</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={panel === "revoke" ? "destructive" : "primary"}
              loading={busy}
              disabled={reason.trim().length < 3 || (panel === "reassign" && !expertRoleId.trim())}
              onClick={() =>
                panel === "revoke"
                  ? run("revoke", { reason })
                  : run("reassign", { expert_role_id: expertRoleId.trim(), reason })
              }
            >
              {panel === "revoke" ? "Revoke" : "Reassign"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel("none")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
