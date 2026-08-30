export type CommissionStatus = "pending" | "payable";

export interface Commission {
  id: string;
  booking_item_id: string;
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
  commissions: Commission[];
}
