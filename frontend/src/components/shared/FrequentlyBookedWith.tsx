"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Card } from "@/components/ui/Card";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { RECOMMENDED_ITEM_LINK_PREFIX, type RecommendedItem } from "@/types/recommendations";

export function FrequentlyBookedWith({ endpoint }: { endpoint: string }) {
  const { data: items } = useQuery({
    queryKey: ["frequently-booked-with", endpoint],
    queryFn: () => apiClient.get<RecommendedItem[]>(endpoint),
  });

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Frequently booked together</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={`${item.item_type}-${item.id}`} href={`${RECOMMENDED_ITEM_LINK_PREFIX[item.item_type]}/${item.id}`}>
            <Card hoverable className="flex h-full flex-col p-3">
              <span className="text-xs font-medium capitalize text-zinc-400">{item.item_type}</span>
              <p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
              <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                {formatMoney(item.price)} <ApproxPrice amountBDT={item.price} />
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
