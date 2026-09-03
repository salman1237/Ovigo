export interface FxRates {
  base: string;
  rates: Record<string, number>;
}

export const CURRENCY_LABELS: Record<string, string> = {
  BDT: "৳ BDT",
  USD: "$ USD",
  EUR: "€ EUR",
  GBP: "£ GBP",
  INR: "₹ INR",
  AED: "AED",
  SAR: "SAR",
  MYR: "MYR",
  SGD: "SGD",
  AUD: "A$ AUD",
  CAD: "C$ CAD",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AED: "AED ",
  SAR: "SAR ",
  MYR: "RM",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
};
