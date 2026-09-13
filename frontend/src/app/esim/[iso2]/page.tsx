"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Info, Wifi } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { EsimCountry, EsimOrder, EsimProduct } from "@/types/esim";

// A plain top-level helper, not a component/hook body, so the navigation side
// effect is unambiguously outside anything React's compiler needs to keep pure.
function goToGatewayPage(url: string) {
  window.location.href = url;
}

export default function EsimProductsPage() {
  const { iso2 } = useParams<{ iso2: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: countries } = useQuery({
    queryKey: ["esim", "countries"],
    queryFn: () => apiClient.get<EsimCountry[]>("/api/v1/esim/countries"),
  });
  const country = countries?.find((c) => c.iso2.toLowerCase() === iso2.toLowerCase());

  const { data: products, isLoading, isError } = useQuery({
    queryKey: ["esim", "products", iso2],
    queryFn: () => apiClient.get<EsimProduct[]>(`/api/v1/esim/countries/${iso2}/products`),
    retry: false,
  });

  const buy = async (product: EsimProduct) => {
    if (!user) {
      router.push("/account/login");
      return;
    }
    setError(null);
    setBuyingId(product.id);
    try {
      const order = await apiClient.post<EsimOrder>(
        "/api/v1/esim/orders",
        { product_id: product.id, country_iso2: iso2.toUpperCase() },
        { auth: true }
      );
      const payment = await apiClient.post<{ gateway_page_url: string }>(
        `/api/v1/esim/orders/${order.id}/pay`,
        undefined,
        { auth: true }
      );
      goToGatewayPage(payment.gateway_page_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start checkout");
      setBuyingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Link href="/esim" className="flex items-center gap-1 text-sm text-zinc-500 hover:text-primary-600 dark:hover:text-primary-400">
        <ArrowLeft className="h-4 w-4" /> All destinations
      </Link>

      <div className="mt-3 flex items-center gap-3">
        {country?.flag_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={country.flag_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        )}
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          eSIM data plans — {country?.name_en ?? iso2.toUpperCase()}
        </h1>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50 p-3 text-xs text-primary-800 dark:border-primary-900 dark:bg-primary-950/40 dark:text-primary-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Before you buy: your phone must be <strong>eSIM-compatible and carrier-unlocked</strong>, and
          installation needs a Wi-Fi connection.
        </p>
      </div>

      {isLoading && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      )}

      {isError && <div className="mt-8"><ErrorState message="Couldn't load plans for this destination." /></div>}

      {!isLoading && !isError && (products ?? []).length === 0 && (
        <div className="mt-8">
          <EmptyState icon={Wifi} title="No plans available for this destination yet" />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(products ?? []).map((product, i) => (
          <motion.div key={product.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
            <Card className="flex h-full flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <Badge variant="primary">{product.data_label}</Badge>
                  <span className="text-xs text-zinc-500">{product.validity_days} days</span>
                </div>
                <p className="mt-3 font-semibold text-zinc-900 dark:text-zinc-50">{product.title}</p>
                <p className="mt-1 text-lg font-semibold text-primary-600 dark:text-primary-400">
                  {formatMoney(product.price_bdt)} <ApproxPrice amountBDT={product.price_bdt} />
                </p>
              </div>
              <Button className="mt-4" onClick={() => buy(product)} loading={buyingId === product.id} disabled={buyingId !== null}>
                Buy this plan
              </Button>
            </Card>
          </motion.div>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
