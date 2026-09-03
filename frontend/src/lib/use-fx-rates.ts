import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { useCurrencyStore } from "@/stores/currency-store";
import type { FxRates } from "@/types/fx";

/** Live BDT exchange rates, refetched at most every 6h (matches the backend's own
 * cache TTL — no point polling more often than the source updates). */
export function useFxRates() {
  return useQuery({
    queryKey: ["fx-rates"],
    queryFn: () => apiClient.get<FxRates>("/api/v1/fx/rates"),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

/** The traveler's chosen display currency, plus a converter from a BDT amount to
 * an "approx." string in that currency — or null if BDT is selected (nothing to
 * show) or the rate isn't available yet (still loading / upstream FX API down). */
export function useApproxPrice() {
  const displayCurrency = useCurrencyStore((s) => s.displayCurrency);
  const { data } = useFxRates();

  const convert = (amountBDT: string | number): number | null => {
    if (displayCurrency === "BDT") return null;
    const rate = data?.rates[displayCurrency];
    if (!rate) return null;
    return Number(amountBDT) * rate;
  };

  return { displayCurrency, convert };
}
