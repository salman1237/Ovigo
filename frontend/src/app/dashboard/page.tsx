"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { PartnerRole } from "@/types/partner";

import { ROLE_PRIORITY } from "./layout";

const FIRST_PAGE_BY_ROLE: Record<string, string> = {
  local_expert: "/dashboard/tours",
  guide: "/dashboard/guide",
  host: "/dashboard/properties",
  hotel: "/dashboard/properties",
  rent_a_car: "/dashboard/vehicles",
};

export default function DashboardIndexPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const { data: roles } = useQuery({
    queryKey: ["my-partner-roles"],
    queryFn: () => apiClient.get<PartnerRole[]>("/api/v1/partners/roles", { auth: true }),
    enabled: !!user,
  });

  useEffect(() => {
    if (!roles) return;
    const firstApproved = ROLE_PRIORITY.find((rt) => roles.some((r) => r.role_type === rt && r.status === "approved"));
    if (firstApproved) {
      router.replace(FIRST_PAGE_BY_ROLE[firstApproved]);
    }
  }, [roles, router]);

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Spinner />
    </div>
  );
}
