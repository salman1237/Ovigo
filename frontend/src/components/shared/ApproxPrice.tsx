"use client";

import { useApproxPrice } from "@/lib/use-fx-rates";
import { CURRENCY_SYMBOLS } from "@/types/fx";

/** An "≈ $12.34" hint next to a real BDT price — display only, never the amount
 * actually charged (every booking is still settled in BDT via SSLCommerz). Renders
 * nothing when the traveler hasn't picked a foreign display currency, or the rate
 * isn't available yet. */
export function ApproxPrice({ amountBDT, className }: { amountBDT: string | number; className?: string }) {
  const { displayCurrency, convert } = useApproxPrice();
  const converted = convert(amountBDT);
  if (converted === null) return null;

  const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? `${displayCurrency} `;
  return (
    <span className={className ?? "text-xs text-zinc-400"}>
      ≈ {symbol}
      {converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}
    </span>
  );
}
