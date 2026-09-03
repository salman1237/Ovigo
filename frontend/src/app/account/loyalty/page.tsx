"use client";

import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { LOYALTY_TRANSACTION_LABELS, type LoyaltyAccount, type LoyaltyTransaction } from "@/types/loyalty";

export default function LoyaltyPage() {
  const user = useAuthStore((s) => s.user);

  const { data: account, isLoading } = useQuery({
    queryKey: ["loyalty", "me"],
    queryFn: () => apiClient.get<LoyaltyAccount>("/api/v1/loyalty/me", { auth: true }),
    enabled: !!user,
  });

  const { data: transactions } = useQuery({
    queryKey: ["loyalty", "transactions"],
    queryFn: () => apiClient.get<LoyaltyTransaction[]>("/api/v1/loyalty/transactions", { auth: true }),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Loyalty Rewards</h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in
          </Link>{" "}
          to see your points.
        </p>
      </div>
    );
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Loyalty Rewards</h1>

      <Card className="mt-6 flex items-center gap-4 bg-gradient-to-br from-primary-600 to-indigo-600 text-white">
        <Coins className="h-10 w-10" />
        <div>
          <p className="text-3xl font-semibold">{account?.points_balance ?? 0}</p>
          <p className="text-sm opacity-90">
            points · worth ৳{((account?.points_balance ?? 0) * Number(account?.point_value_bdt ?? 1)).toFixed(2)} off your next
            booking
          </p>
        </div>
      </Card>
      <p className="mt-2 text-xs text-zinc-500">
        Earn {account?.points_per_100_bdt_spent ?? 1} point per ৳100 spent on a completed booking. Redeem points at checkout —
        1 point = ৳{account?.point_value_bdt ?? "1"} off.
      </p>

      <h2 className="mt-8 text-sm font-semibold text-zinc-700 dark:text-zinc-300">History</h2>
      {(transactions ?? []).length === 0 && (
        <div className="mt-4">
          <EmptyState icon={Coins} title="No activity yet" description="Complete a booking to start earning points." />
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {(transactions ?? []).map((t) => (
          <Card key={t.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{LOYALTY_TRANSACTION_LABELS[t.reason]}</p>
              <p className="text-xs text-zinc-500">{new Date(t.created_at).toLocaleDateString()}</p>
            </div>
            <span className={t.points_delta >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
              {t.points_delta >= 0 ? "+" : ""}
              {t.points_delta}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
