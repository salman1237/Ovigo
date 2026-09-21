"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { PartnerRoleType } from "@/types/partner";

interface MyPartnerRole {
  role_type: PartnerRoleType;
  status: string;
}

/** Which partner role types the current user actually holds an APPROVED role
 * for — used to only show role-relevant nav links instead of every partner
 * feature to every logged-in user regardless of what they've applied for. */
export function useMyApprovedRoleTypes(): Set<PartnerRoleType> {
  const user = useAuthStore((s) => s.user);
  const { data } = useQuery({
    queryKey: ["partners", "my-roles"],
    queryFn: () => apiClient.get<MyPartnerRole[]>("/api/v1/partners/roles", { auth: true }),
    enabled: !!user,
  });
  return new Set((data ?? []).filter((r) => r.status === "approved").map((r) => r.role_type));
}
