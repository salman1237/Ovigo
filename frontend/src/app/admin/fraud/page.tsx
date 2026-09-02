"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { FraudFlag, FraudFlagStatus, FraudSeverity, FRAUD_RULE_LABELS } from "@/types/fraud";

const TABS: (FraudFlagStatus | "all")[] = ["open", "resolved", "dismissed", "all"];

const SEVERITY_VARIANT: Record<FraudSeverity, BadgeProps["variant"]> = {
  low: "neutral",
  medium: "primary",
  high: "warning",
  critical: "danger",
};

export default function AdminFraudPage() {
  const [tab, setTab] = useState<FraudFlagStatus | "all">("open");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: flags, isLoading } = useQuery({
    queryKey: ["admin-fraud-flags", tab],
    queryFn: () => apiClient.get<FraudFlag[]>(`/api/v1/admin/fraud/flags${tab === "all" ? "" : `?status=${tab}`}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-fraud-flags"] });

  const runScan = async () => {
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    try {
      const result = await apiClient.post<{ new_flags_count: number }>("/api/v1/admin/fraud/scan-documents", undefined, { auth: true });
      setScanResult(`Scan complete: ${result.new_flags_count} new flag(s) found.`);
      refetch();
    } catch (err) {
      setScanError(err instanceof ApiError ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Fraud &amp; Risk</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Self-booking, self-review, self-referral and rapid-cancellation flags fire automatically. Duplicate identity
            documents need a manual scan (cross-account comparison).
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={runScan} loading={scanning}>
          Scan documents
        </Button>
      </div>
      {scanResult && <p className="mt-2 text-sm text-emerald-600">{scanResult}</p>}
      {scanError && <p className="mt-2 text-sm text-red-600">{scanError}</p>}

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
      {!isLoading && (flags ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab === "all" ? "" : tab} flags`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(flags ?? []).map((f) => (
          <FlagCard key={f.id} flag={f} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function FlagCard({ flag, onChange }: { flag: FraudFlag; onChange: () => void }) {
  const [note, setNote] = useState("");
  const [showActions, setShowActions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"resolve" | "dismiss" | null>(null);

  const act = async (action: "resolve" | "dismiss") => {
    setBusy(action);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/fraud/flags/${flag.id}/${action}`, { resolution_note: note || undefined }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            {flag.user_name}
            <Badge variant={SEVERITY_VARIANT[flag.severity]} className="ml-2 text-[10px] capitalize">
              {flag.severity}
            </Badge>
          </h3>
          <p className="text-xs text-zinc-500">
            {flag.user_email} · {FRAUD_RULE_LABELS[flag.rule_type]} · score {flag.score} · {new Date(flag.created_at).toLocaleString()}
          </p>
        </div>
        <Badge variant={flag.status === "open" ? "warning" : flag.status === "resolved" ? "success" : "neutral"} className="capitalize">
          {flag.status}
        </Badge>
      </div>

      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{flag.description}</p>

      {flag.status !== "open" && flag.resolution_note && (
        <p className="mt-2 text-xs text-zinc-500">Note: {flag.resolution_note}</p>
      )}

      {flag.status === "open" && (
        <div className="mt-3">
          {!showActions && (
            <Button size="sm" onClick={() => setShowActions(true)}>
              Review
            </Button>
          )}
          {showActions && (
            <div className="mt-2 flex flex-col gap-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => act("resolve")} loading={busy === "resolve"}>
                  Resolve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act("dismiss")} loading={busy === "dismiss"}>
                  Dismiss
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowActions(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
