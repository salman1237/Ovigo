export interface LocalExpertProfile {
  id: string;
  partner_role_id: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[] | null;
  is_published: boolean;
  has_photo: boolean;
  created_at: string;
}

export interface HostProfile {
  id: string;
  partner_role_id: string;
  business_name: string | null;
  bio: string | null;
  is_published: boolean;
  has_photo: boolean;
  created_at: string;
}
