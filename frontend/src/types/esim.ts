export interface EsimCountry {
  id: number;
  iso2: string;
  iso3: string;
  name_en: string;
  name_bn: string | null;
  flag_url: string | null;
  region: string | null;
  is_popular: boolean;
}

export interface EsimProduct {
  id: string;
  title: string;
  data_label: string;
  is_unlimited: boolean;
  data_amount_gb: string;
  validity_days: number;
  price_bdt: string;
}

export type EsimOrderStatus =
  | "pending_payment"
  | "paid"
  | "provisioning"
  | "completed"
  | "refund_pending"
  | "refunded"
  | "cancelled";

export const ESIM_ORDER_STATUS_LABELS: Record<EsimOrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Payment received",
  provisioning: "Setting up your eSIM",
  completed: "Ready to install",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export interface EsimInstallLinks {
  ios: string | null;
  android: string | null;
}

export interface EsimOrder {
  id: string;
  status: EsimOrderStatus;
  triptel_product_id: string;
  product_title: string;
  country_iso2: string;
  country_name: string;
  data_amount_gb: string;
  is_unlimited: boolean;
  validity_days: number;
  price_bdt: string;
  currency: string;
  triptel_order_no: string | null;
  iccid: string | null;
  lpa_string: string | null;
  qr_code_data: string | null;
  smdp_address: string | null;
  matching_id: string | null;
  install_links: EsimInstallLinks | null;
  failure_reason: string | null;
  refunded_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminEsimOrder extends EsimOrder {
  user_id: string;
  user_email: string | null;
  tran_id: string | null;
  val_id: string | null;
  cost_usd: string;
  exchange_rate: string;
  margin_bdt: string;
  markup_pct: string;
  triptel_order_id: string | null;
  triptel_status: string | null;
  last_synced_at: string | null;
  refunded_by_id: string | null;
  refund_note: string | null;
}

export interface EsimPricingConfig {
  usd_to_bdt_rate: string;
  markup_pct: string;
  rounding_step_bdt: number;
  is_enabled: boolean;
  updated_at: string;
}

export interface EsimAccount {
  business_name: string;
  commission_rate_pct: string;
  wallet_balance: string;
  wallet_currency: string;
  commission_balance: string;
  webhook_configured: boolean;
}
