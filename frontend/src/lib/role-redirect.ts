import { apiClient } from "@/lib/api-client";
import type { PartnerRole } from "@/types/partner";
import type { User } from "@/types/user";

/** Where a signed-in, non-traveler user belongs: admins go to /admin; anyone
 * holding at least one approved partner role goes to their dashboard; plain
 * travelers stay on the homepage (this returns null for them). */
export async function nonTravelerHomePath(user: User): Promise<string | null> {
  if (user.system_role === "admin" || user.system_role === "super_admin") {
    return "/admin";
  }
  try {
    const roles = await apiClient.get<PartnerRole[]>("/api/v1/partners/roles", { auth: true });
    if (roles.some((r) => r.status === "approved")) {
      return "/dashboard";
    }
  } catch {
    // Fall through to null (homepage) if the roles lookup fails for any reason.
  }
  return null;
}
