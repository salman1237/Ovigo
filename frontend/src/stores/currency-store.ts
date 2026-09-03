import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CurrencyState {
  displayCurrency: string; // "BDT" means no conversion shown — the real charged currency
  setDisplayCurrency: (currency: string) => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      displayCurrency: "BDT",
      setDisplayCurrency: (currency) => set({ displayCurrency: currency }),
    }),
    { name: "ovigo_display_currency" }
  )
);
