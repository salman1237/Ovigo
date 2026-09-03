"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import type { PromoCode, PromoDiscountType } from "@/types/promotions";

export default function AdminPromotionsPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<PromoDiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: promoCodes, isLoading } = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: () => apiClient.get<PromoCode[]>("/api/v1/admin/promotions", { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-promotions"] });

  const create = async () => {
    if (!code.trim() || !discountValue) return;
    setCreating(true);
    setError(null);
    try {
      await apiClient.post(
        "/api/v1/admin/promotions",
        {
          code: code.trim().toUpperCase(),
          discount_type: discountType,
          discount_value: discountValue,
          max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
        },
        { auth: true }
      );
      setCode("");
      setDiscountValue("10");
      setMaxRedemptions("");
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create promo code");
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (id: string) => {
    try {
      await apiClient.post(`/api/v1/admin/promotions/${id}/deactivate`, undefined, { auth: true });
      refetch();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Failed to deactivate");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Promo Codes</h1>

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Create a promo code</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="WELCOME10" />
          <Select label="Discount type" value={discountType} onChange={(e) => setDiscountType(e.target.value as PromoDiscountType)}>
            <option value="percentage">Percentage off</option>
            <option value="fixed_amount">Fixed BDT amount off</option>
          </Select>
          <Input
            type="number"
            label={discountType === "percentage" ? "Discount %" : "Discount ৳"}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
          />
          <Input
            type="number"
            label="Max total redemptions (blank = unlimited)"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <Button className="mt-3" onClick={create} loading={creating} disabled={!code.trim() || !discountValue}>
          Create promo code
        </Button>
      </Card>

      <h2 className="mt-8 text-sm font-semibold text-zinc-700 dark:text-zinc-300">All promo codes</h2>
      {isLoading && <Spinner />}
      {!isLoading && (promoCodes ?? []).length === 0 && (
        <div className="mt-4">
          <EmptyState title="No promo codes yet" description="Create one above to run a promotion." />
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {(promoCodes ?? []).map((p) => (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">{p.code}</p>
              <p className="text-xs text-zinc-500">
                {p.discount_type === "percentage" ? `${p.discount_value}% off` : `৳${p.discount_value} off`} · used{" "}
                {p.redemption_count}
                {p.max_redemptions !== null ? `/${p.max_redemptions}` : ""} time(s)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={p.is_active ? "success" : "neutral"}>{p.is_active ? "Active" : "Inactive"}</Badge>
              {p.is_active && (
                <Button size="sm" variant="destructive" onClick={() => deactivate(p.id)}>
                  Deactivate
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
