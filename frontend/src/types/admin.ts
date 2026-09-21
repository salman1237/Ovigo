export type AdminPermissionRole = "finance_admin" | "operations_admin" | "support" | "moderator" | "verification_team";

export const ADMIN_PERMISSION_ROLE_LABELS: Record<AdminPermissionRole, string> = {
  finance_admin: "Finance Admin",
  operations_admin: "Operations Admin",
  support: "Support",
  moderator: "Moderator",
  verification_team: "Verification Team",
};

export interface AdminAccount {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  system_role: "traveler" | "admin" | "super_admin";
  admin_permission_role: AdminPermissionRole | null;
  is_active: boolean;
}
