"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { CommissionRule, CommissionRuleScope } from "@/types/earnings";

const ITEM_TYPES = ["tour_departure", "room_type", "custom_bid", "vehicle_rental"] as const;

export default function CommissionRulesPage() {
  const [showForm, setShowForm] = useState(false);
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
        <Button size="sm" variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New rule"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        A PARTNER-scope rule for a specific partner overrides the CATEGORY default for that item type.
        There is one platform-wide NETWORK rule applied to referring experts.
      </p>

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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={submit} loading={busy} disabled={!rate || (scope === "partner" && !partnerRoleId)} className="self-start">
        Create rule
      </Button>
    </Card>
  );
}
