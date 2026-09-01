export type CommissionStatus = "pending" | "payable" | "paid" | "on_hold" | "cancelled";
export type CommissionSource = "direct" | "network";

export interface Commission {
  id: string;
  booking_item_id: string;
  source: CommissionSource;
  gross_amount: string;
  rate: string;
  commission_amount: string;
  partner_net_amount: string;
  status: CommissionStatus;
  created_at: string;
}

export interface EarningsSummary {
  total_gross: string;
  total_commission: string;
  total_net_pending: string;
  total_net_payable: string;
  total_net_paid: string;
  total_net_on_hold: string;
  commissions: Commission[];
}

export type CommissionRuleScope = "category" | "partner" | "network";

export interface CommissionRule {
  id: string;
  scope: CommissionRuleScope;
  item_type: "tour_departure" | "room_type" | "custom_bid" | "vehicle_rental" | null;
  partner_role_id: string | null;
  rate: string;
  is_active: boolean;
  created_at: string;
}

export type PayoutStatus = "paid";

export interface Payout {
  id: string;
  partner_role_id: string;
  total_amount: string;
  commission_count: number;
  status: PayoutStatus;
  created_at: string;
  paid_at: string;
}

export interface PayoutPreviewRow {
  partner_role_id: string;
  partner_name: string;
  commission_count: number;
  total_amount: string;
}
