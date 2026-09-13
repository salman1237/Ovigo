"use client";

import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import Link from "next/link";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { ESIM_ORDER_STATUS_LABELS, type EsimOrder, type EsimOrderStatus } from "@/types/esim";

const STATUS_VARIANT: Record<EsimOrderStatus, NonNullable<BadgeProps["variant"]>> = {
  pending_payment: "neutral",
  paid: "primary",
  provisioning: "primary",
  completed: "success",
  refund_pending: "warning",
  refunded: "neutral",
  cancelled: "danger",
};

export default function EsimOrdersPage() {
  const user = useAuthStore((s) => s.user);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["esim", "orders"],
    queryFn: () => apiClient.get<EsimOrder[]>("/api/v1/esim/orders", { auth: true }),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My eSIMs</h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in
          </Link>{" "}
          to see your eSIM orders.
        </p>
      </div>
    );
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My eSIMs</h1>
        <Link href="/esim" className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
          Buy another
        </Link>
      </div>

      {(orders ?? []).length === 0 && (
        <div className="mt-8">
          <EmptyState
            icon={Smartphone}
            title="No eSIM orders yet"
            description="Browse destinations and get connected before your next trip."
          />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(orders ?? []).map((order) => (
          <Link key={order.id} href={`/esim/orders/${order.id}`}>
            <Card hoverable className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{order.product_title}</p>
                <p className="text-xs text-zinc-500">
                  {order.country_name} · {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-primary-600 dark:text-primary-400">{formatMoney(order.price_bdt)}</span>
                <Badge variant={STATUS_VARIANT[order.status]}>{ESIM_ORDER_STATUS_LABELS[order.status]}</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
