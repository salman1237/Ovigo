export type AdEntityType = "tour" | "property" | "vehicle";
export type AdPlacementType = "search" | "featured" | "banner" | "card" | "sponsored";
export type AdBillingModel = "cpc" | "cpm";
export type AdCampaignStatus = "draft" | "pending_review" | "active" | "paused" | "rejected" | "completed";

export const PLACEMENT_LABELS: Record<AdPlacementType, string> = {
  search: "Search results",
  featured: "Featured",
  banner: "Banner",
  card: "Card",
  sponsored: "Sponsored",
};

export interface AdCampaign {
  id: string;
  partner_role_id: string;
  entity_type: AdEntityType;
  entity_id: string;
  entity_title: string;
  placement_type: AdPlacementType;
  billing_model: AdBillingModel;
  bid_amount: string;
  budget_total: string;
  budget_spent: string;
  status: AdCampaignStatus;
  rejection_reason: string | null;
  start_date: string | null;
  end_date: string | null;
  impressions_count: number;
  clicks_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdCampaignStats {
  impressions_count: number;
  clicks_count: number;
  click_through_rate: number;
  budget_total: string;
  budget_spent: string;
  budget_remaining: string;
}

export interface AdApplicant {
  full_name: string;
  email: string | null;
  phone: string | null;
}

export interface AdminAdCampaign extends AdCampaign {
  applicant: AdApplicant;
}

export interface SponsoredResult {
  campaign_id: string;
  entity_type: AdEntityType;
  entity_id: string;
  entity_title: string;
}
