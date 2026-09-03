export type PromoDiscountType = "percentage" | "fixed_amount";

export interface PromoCode {
  id: string;
  code: string;
  discount_type: PromoDiscountType;
  discount_value: string;
  max_redemptions: number | null;
  redemption_count: number;
  max_redemptions_per_user: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PromoCodeValidateResult {
  is_valid: boolean;
  reason: string | null;
  discount_type: PromoDiscountType | null;
  discount_value: string | null;
}
