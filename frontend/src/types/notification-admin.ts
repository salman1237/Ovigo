export type CampaignAudience = "all_users" | "travelers_only" | "partners_only";

export const CAMPAIGN_AUDIENCE_LABELS: Record<CampaignAudience, string> = {
  all_users: "Everyone",
  travelers_only: "Travelers only",
  partners_only: "Partners only",
};

export interface NotificationTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationCampaign {
  id: string;
  template_id: string | null;
  title: string;
  message: string;
  audience: CampaignAudience;
  audience_role_type: string | null;
  is_urgent: boolean;
  recipient_count: number;
  sent_by_id: string | null;
  created_at: string;
}
