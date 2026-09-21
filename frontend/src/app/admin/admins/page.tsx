"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ADMIN_PERMISSION_ROLE_LABELS, AdminAccount, AdminPermissionRole } from "@/types/admin";

const ROLES = Object.keys(ADMIN_PERMISSION_ROLE_LABELS) as AdminPermissionRole[];

export default function AdminRolesPage() {
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: admins, isLoading, isError } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => apiClient.get<AdminAccount[]>("/api/v1/admin/admins", { auth: true }),
    retry: false,
  });

  const setRole = async (userId: string, role: AdminPermissionRole | "") => {
    await apiClient.post(
      `/api/v1/admin/admins/${userId}/permission-role`,
      { admin_permission_role: role || null },
      { auth: true }
    );
    queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
  };

  if (currentUser?.system_role !== "super_admin") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Admin Roles</h1>
        <p className="mt-4 text-sm text-zinc-500">Only Super Admins can manage other admins&apos; permission roles.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Admin Roles</h1>
      <p className="mt-1 text-sm text-zinc-500">
        A permission role narrows what that admin can do. Leaving it unset keeps full legacy access to every
        admin action — narrowing is opt-in per account, never automatic.
      </p>

      {isLoading && <Spinner />}
      {isError && <p className="mt-4 text-sm text-red-600">Failed to load admin accounts.</p>}

      <div className="mt-6 flex flex-col gap-3">
        {(admins ?? []).map((admin) => (
          <Card key={admin.id} className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{admin.full_name}</h3>
              <p className="text-xs text-zinc-500">
                {admin.email ?? admin.phone} · {admin.system_role === "super_admin" ? "Super Admin" : "Admin"}
                {!admin.is_active && <span className="ml-2 font-medium text-red-600">Suspended</span>}
              </p>
            </div>
            {admin.system_role === "super_admin" ? (
              <Badge variant="primary">Full access</Badge>
            ) : (
              <Select
                value={admin.admin_permission_role ?? ""}
                onChange={(e) => setRole(admin.id, e.target.value as AdminPermissionRole | "")}
                className="w-auto"
              >
                <option value="">Full access (no restriction)</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ADMIN_PERMISSION_ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
