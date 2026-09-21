"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { formatMoney } from "@/lib/format";
import { apiClient, ApiError } from "@/lib/api-client";
import { CommissionPreviewResult, CommissionRule, CommissionRuleScope } from "@/types/earnings";

const ITEM_TYPES = ["tour_departure", "room_type", "custom_bid", "vehicle_rental"] as const;

export default function CommissionRulesPage() {
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const queryClient = useQueryClient();

  const { data: rules, isLoading } = useQuery({
    queryKey: ["admin-commission-rules"],
    queryFn: () => apiClient.get<CommissionRule[]>("/api/v1/admin/commission-rules", { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-commission-rules"] });

  const deactivate = async (id: string) => {
    await apiClient.post(`/api/v1/admin/commission-rules/${id}/deactivate`, undefined, { auth: true });
    refetch();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Commission Rules</h1>
        <div className="flex gap-2">
          <Button size="sm" variant={showPreview ? "secondary" : "ghost"} onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? "Close preview" : "Preview calculation"}
          </Button>
          <Button size="sm" variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "New rule"}
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        A PARTNER-scope rule for a specific partner overrides the CATEGORY default for that item type.
        There is one platform-wide NETWORK rule applied to referring experts. A rule with an effective/expiry
        date only applies within that window — useful for scheduling a rate change or a time-boxed promo rate.
      </p>

      {showPreview && <PreviewTool />}
      {showForm && <RuleForm onCreated={() => { setShowForm(false); refetch(); }} />}

      {isLoading && <Spinner />}

      {!isLoading && (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-400 dark:border-zinc-800">
                <th className="py-3 pl-4 pr-4">Scope</th>
                <th className="py-3 pr-4">Item type</th>
                <th className="py-3 pr-4">Partner</th>
                <th className="py-3 pr-4">Rate</th>
                <th className="py-3 pr-4">Window</th>
                <th className="py-3 pr-4">Active</th>
                <th className="py-3 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {(rules ?? []).map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
                  <td className="py-2.5 pl-4 pr-4 capitalize">{r.scope}</td>
                  <td className="py-2.5 pr-4">{r.item_type ?? "—"}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs">{r.partner_role_id ? r.partner_role_id.slice(0, 8) : "—"}</td>
                  <td className="py-2.5 pr-4 font-medium text-primary-600 dark:text-primary-400">{(Number(r.rate) * 100).toFixed(2)}%</td>
                  <td className="py-2.5 pr-4 text-xs text-zinc-500">
                    {r.effective_date || r.expiry_date
                      ? `${r.effective_date ?? "always"} → ${r.expiry_date ?? "never"}`
                      : "Always"}
                  </td>
                  <td className="py-2.5 pr-4">{r.is_active ? "Yes" : "No"}</td>
                  <td className="py-2.5 pr-4">
                    {r.is_active && (
                      <button onClick={() => deactivate(r.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function RuleForm({ onCreated }: { onCreated: () => void }) {
  const [scope, setScope] = useState<CommissionRuleScope>("category");
  const [itemType, setItemType] = useState<string>("tour_departure");
  const [partnerRoleId, setPartnerRoleId] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiClient.post(
        "/api/v1/admin/commission-rules",
        {
          scope,
          item_type: scope === "network" ? undefined : itemType,
          partner_role_id: scope === "partner" ? partnerRoleId : undefined,
          rate: (Number(rate) / 100).toString(),
          effective_date: effectiveDate || undefined,
          expiry_date: expiryDate || undefined,
        },
        { auth: true }
      );
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create rule");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4 flex flex-col gap-3">
      <div className="flex gap-4 text-xs">
        {(["category", "partner", "network"] as CommissionRuleScope[]).map((s) => (
          <label key={s} className="flex items-center gap-1.5 capitalize">
            <input type="radio" checked={scope === s} onChange={() => setScope(s)} />
            {s}
          </label>
        ))}
      </div>
      {scope !== "network" && (
        <Select value={itemType} onChange={(e) => setItemType(e.target.value)} className="w-auto">
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      )}
      {scope === "partner" && (
        <Input value={partnerRoleId} onChange={(e) => setPartnerRoleId(e.target.value)} placeholder="Partner role ID" />
      )}
      <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Rate as a percentage, e.g. 12" />
      <div className="grid grid-cols-2 gap-3">
        <Input type="date" label="Effective date (optional)" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        <Input type="date" label="Expiry date (optional)" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={submit} loading={busy} disabled={!rate || (scope === "partner" && !partnerRoleId)} className="self-start">
        Create rule
      </Button>
    </Card>
  );
}

function PreviewTool() {
  const [itemType, setItemType] = useState<string>("tour_departure");
  const [partnerRoleId, setPartnerRoleId] = useState("");
  const [grossAmount, setGrossAmount] = useState("");
  const [result, setResult] = useState<CommissionPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = async () => {
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const res = await apiClient.post<CommissionPreviewResult>(
        "/api/v1/admin/commission-rules/preview",
        { item_type: itemType, partner_role_id: partnerRoleId, gross_amount: grossAmount },
        { auth: true }
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to preview");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4 flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        A dry run of what commission would actually apply right now — no Commission row is created.
      </p>
      <Select value={itemType} onChange={(e) => setItemType(e.target.value)} className="w-auto">
        {ITEM_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </Select>
      <Input value={partnerRoleId} onChange={(e) => setPartnerRoleId(e.target.value)} placeholder="Partner role ID" />
      <Input type="number" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} placeholder="Gross amount (৳), e.g. 10000" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={preview} loading={busy} disabled={!partnerRoleId || !grossAmount} className="self-start">
        Preview
      </Button>
      {result && (
        <div className="mt-2 flex flex-col gap-1 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <p>
            <span className="font-medium">Direct:</span> {(Number(result.direct_rate) * 100).toFixed(2)}% ={" "}
            {formatMoney(result.direct_commission_amount)} commission, {formatMoney(result.direct_partner_net_amount)} net to partner
          </p>
          {result.network_rate ? (
            <p>
              <span className="font-medium">Network (referral):</span> {(Number(result.network_rate) * 100).toFixed(2)}% ={" "}
              {formatMoney(result.network_commission_amount!)} to referring expert {result.network_referring_role_id?.slice(0, 8)}
            </p>
          ) : (
            <p className="text-zinc-500">No linked referral — no network commission.</p>
          )}
        </div>
      )}
    </Card>
  );
}
