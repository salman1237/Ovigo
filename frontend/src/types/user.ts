export type SystemRole = "traveler" | "admin" | "super_admin";

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  system_role: SystemRole;
  is_active: boolean;
  is_email_verified: boolean;
  is_phone_verified: boolean;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}
