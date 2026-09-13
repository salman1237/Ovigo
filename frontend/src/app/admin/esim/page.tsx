"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import {
  ESIM_ORDER_STATUS_LABELS,
  type AdminEsimOrder,
  type EsimAccount,
  type EsimOrderStatus,
  type EsimPricingConfig,
} from "@/types/esim";

const STATUS_TABS: (EsimOrderStatus | "all")[] = [
  "all",
  "paid",
  "provisioning",
  "refund_pending",
  "completed",
  "refunded",
  "cancelled",
];

const STATUS_VARIANT: Record<EsimOrderStatus, NonNullable<BadgeProps["variant"]>> = {
  pending_payment: "neutral",
  paid: "primary",
  provisioning: "primary",
  completed: "success",
  refund_pending: "warning",
  refunded: "neutral",
  cancelled: "danger",
};

export default function AdminEsimPage() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.system_role === "super_admin";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<EsimOrderStatus | "all">("all");
  const [q, setQ] = useState("");

  const { data: account } = useQuery({
    queryKey: ["admin-esim", "account"],
    queryFn: () => apiClient.get<EsimAccount>("/api/v1/admin/esim/account", { auth: true }),
    retry: false,
  });

  const { data: pricing } = useQuery({
    queryKey: ["admin-esim", "pricing"],
    queryFn: () => apiClient.get<EsimPricingConfig>("/api/v1/admin/esim/pricing", { auth: true }),
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-esim", "orders", tab, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("status", tab);
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();
      return apiClient.get<AdminEsimOrder[]>(`/api/v1/admin/esim/orders${qs ? `?${qs}` : ""}`, { auth: true });
    },
  });

  const refetchOrders = () => queryClient.invalidateQueries({ queryKey: ["admin-esim", "orders"] });

  const syncOrder = async (id: string) => {
    try {
      await apiClient.post(`/api/v1/admin/esim/orders/${id}/sync`, undefined, { auth: true });
      refetchOrders();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Failed to sync");
    }
  };

  const retryProvisioning = async (id: string) => {
    try {
      await apiClient.post(`/api/v1/admin/esim/orders/${id}/retry-provisioning`, undefined, { auth: true });
      refetchOrders();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Failed to retry provisioning");
    }
  };

  const markRefunded = async (id: string) => {
    const note = window.prompt("Confirm this traveler was refunded outside the system. Add a note:");
    if (!note || note.trim().length < 3) return;
    try {
      await apiClient.post(`/api/v1/admin/esim/orders/${id}/mark-refunded`, { note }, { auth: true });
      refetchOrders();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Failed to mark refunded");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">eSIM Orders</h1>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Triptel account</h2>
          {account ? (
            <div className="mt-2 flex flex-col gap-1 text-sm">
              <p>
                Wallet balance:{" "}
                <span className={Number(account.wallet_balance) < 20 ? "font-semibold text-red-600" : "font-semibold"}>
                  ${account.wallet_balance}
                </span>
                {Number(account.wallet_balance) < 20 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-600">
                    <AlertTriangle className="h-3 w-3" /> Low balance — top up soon
                  </span>
                )}
              </p>
              <p className="text-zinc-500">Commission balance: ${account.commission_balance}</p>
              <p className="text-zinc-500">Commission rate: {account.commission_rate_pct}%</p>
              <p className="text-zinc-500">
                Webhook:{" "}
                {account.webhook_configured ? (
                  <span className="text-emerald-600">configured</span>
                ) : (
                  <span className="text-amber-600">not configured</span>
                )}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">Unavailable — is TRIPTEL_API_KEY configured?</p>
          )}
        </Card>

        <PricingCard config={pricing} readOnly={!isSuperAdmin} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {t === "all" ? "All" : ESIM_ORDER_STATUS_LABELS[t]}
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email, tran_id, ICCID…" className="ml-auto max-w-xs" />
      </div>

      {isLoading && <Spinner />}
      {!isLoading && (orders ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No eSIM orders found" />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {(orders ?? []).map((order) => (
          <Card key={order.id} className={order.status === "refund_pending" ? "border-amber-300 dark:border-amber-800" : undefined}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {order.product_title} — {order.country_name}
                </p>
                <p className="text-xs text-zinc-500">
                  {order.user_email ?? order.user_id} · {new Date(order.created_at).toLocaleString()}
                </p>
                {order.triptel_order_no && <p className="text-xs text-zinc-400">Triptel: {order.triptel_order_no}</p>}
                {order.tran_id && <p className="text-xs text-zinc-400">tran_id: {order.tran_id}</p>}
              </div>
              <Badge variant={STATUS_VARIANT[order.status]}>{ESIM_ORDER_STATUS_LABELS[order.status]}</Badge>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <span>
                Price: <span className="font-medium">{formatMoney(order.price_bdt)}</span>
              </span>
              <span className="text-zinc-500">Cost: ${order.cost_usd}</span>
              <span className={Number(order.margin_bdt) >= 0 ? "text-emerald-600" : "text-red-600"}>
                Margin: {formatMoney(order.margin_bdt)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => syncOrder(order.id)}>
                Sync
              </Button>
              {order.status === "paid" && (
                <Button size="sm" variant="secondary" onClick={() => retryProvisioning(order.id)}>
                  Retry provisioning
                </Button>
              )}
              {order.status === "refund_pending" && (
                <Button size="sm" variant="destructive" onClick={() => markRefunded(order.id)}>
                  Mark refunded
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PricingCard({ config, readOnly }: { config: EsimPricingConfig | undefined; readOnly: boolean }) {
  if (!config) {
    return (
      <Card>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pricing</h2>
        <p className="mt-2 text-sm text-zinc-400">Loading…</p>
      </Card>
    );
  }
  // Keyed by updated_at below so this remounts (picking up fresh initial state)
  // whenever the config changes elsewhere — e.g. after another admin's save.
  return <PricingForm key={config.updated_at} config={config} readOnly={readOnly} />;
}

function PricingForm({ config, readOnly }: { config: EsimPricingConfig; readOnly: boolean }) {
  const queryClient = useQueryClient();
  // Initialized directly from props — this component only ever mounts once
  // `config` exists (see PricingCard above), so no effect is needed to sync it in.
  const [rate, setRate] = useState(config.usd_to_bdt_rate);
  const [markup, setMarkup] = useState(config.markup_pct);
  const [step, setStep] = useState(String(config.rounding_step_bdt));
  const [enabled, setEnabled] = useState(config.is_enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exampleUsd = 4.5;
  const examplePrice = rate && markup ? (exampleUsd * Number(rate) * (1 + Number(markup) / 100)).toFixed(2) : null;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await apiClient.put(
        "/api/v1/admin/esim/pricing",
        { usd_to_bdt_rate: rate, markup_pct: markup, rounding_step_bdt: Number(step), is_enabled: enabled },
        { auth: true }
      );
      queryClient.invalidateQueries({ queryKey: ["admin-esim", "pricing"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pricing</h2>
      {readOnly && <p className="mt-1 text-xs text-zinc-400">Read-only — Super Admin can edit.</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Input label="USD → BDT rate" value={rate} onChange={(e) => setRate(e.target.value)} disabled={readOnly} />
        <Input label="Markup %" value={markup} onChange={(e) => setMarkup(e.target.value)} disabled={readOnly} />
        <Input label="Rounding step (৳)" value={step} onChange={(e) => setStep(e.target.value)} disabled={readOnly} />
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} />
          Store enabled
        </label>
      </div>
      {examplePrice && (
        <p className="mt-2 text-xs text-zinc-500">
          Example: a $4.50 plan sells for ৳{examplePrice} (before rounding to the step above).
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {!readOnly && (
        <Button size="sm" className="mt-3" onClick={save} loading={saving}>
          Save pricing
        </Button>
      )}
    </Card>
  );
}
