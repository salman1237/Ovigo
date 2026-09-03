export interface LoyaltyAccount {
  points_balance: number;
  point_value_bdt: string;
  points_per_100_bdt_spent: number;
}

export type LoyaltyTransactionReason = "earned" | "redeemed" | "refunded" | "admin_adjustment";

export interface LoyaltyTransaction {
  id: string;
  booking_id: string | null;
  reason: LoyaltyTransactionReason;
  points_delta: number;
  note: string | null;
  created_at: string;
}

export const LOYALTY_TRANSACTION_LABELS: Record<LoyaltyTransactionReason, string> = {
  earned: "Earned",
  redeemed: "Redeemed",
  refunded: "Refunded",
  admin_adjustment: "Adjustment",
};
