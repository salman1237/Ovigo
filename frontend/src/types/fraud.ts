export type FraudRuleType =
  | "duplicate_identity_document"
  | "self_referral"
  | "self_review"
  | "self_booking"
  | "rapid_cancellation_pattern"
  | "sudden_price_change"
  | "duplicate_property_listing"
  | "expired_vehicle_document"
  | "high_refund_rate"
  | "referral_network_volume"
  | "instant_cancellation_pattern";

export type FraudSeverity = "low" | "medium" | "high" | "critical";
export type FraudFlagStatus = "open" | "resolved" | "dismissed";

export const FRAUD_RULE_LABELS: Record<FraudRuleType, string> = {
  duplicate_identity_document: "Duplicate Identity Document",
  self_referral: "Self Referral",
  self_review: "Self Review",
  self_booking: "Self Booking",
  rapid_cancellation_pattern: "Rapid Cancellation Pattern",
  sudden_price_change: "Sudden Price Change",
  duplicate_property_listing: "Duplicate Property Listing",
  expired_vehicle_document: "Expired Vehicle Document",
  high_refund_rate: "High Refund Rate",
  referral_network_volume: "Referral Network Volume",
  instant_cancellation_pattern: "Instant Cancellation Pattern",
};

export interface FraudFlag {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  rule_type: FraudRuleType;
  severity: FraudSeverity;
  score: number;
  description: string;
  context_id: string | null;
  status: FraudFlagStatus;
  resolved_by_id: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface UserRiskReport {
  user_id: string;
  risk_score: number;
  flags: FraudFlag[];
}
