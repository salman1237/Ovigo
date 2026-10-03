"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import {
  ADMIN_PERMISSION_ROLE_LABELS,
  AdminAccount,
  PermissionCategory,
} from "@/types/admin";

const PRESET_PERMISSIONS: Record<string, string[]> = {
  finance_admin: [
    "payouts.view",
    "payouts.process",
    "commission_rules.view",
    "commission_rules.write",
    "referrals.commission",
  ],
  operations_admin: [
    "payouts.view",
    "commission_rules.view",
    "bookings.view",
    "bookings.manage",
    "disputes.view",
    "disputes.resolve",
    "fraud.view",
    "users.suspend",
    "verification.view",
    "verification.approve",
    "tours.view",
    "tours.approve",
    "tours.suspend",
    "vehicles.view",
    "vehicles.approve",
    "vehicles.suspend",
    "properties.view",
    "properties.approve",
    "properties.suspend",
  ],
  support: [
    "bookings.view",
    "disputes.view",
    "disputes.resolve",
    "verification.view",
    "tours.view",
    "vehicles.view",
    "properties.view",
    "users.view",
  ],
  moderator: [
    "content.moderate",
    "verification.view",
    "tours.view",
    "tours.approve",
    "tours.suspend",
    "vehicles.view",
    "vehicles.approve",
    "vehicles.suspend",
    "properties.view",
    "properties.approve",
    "properties.suspend",
  ],
  verification_team: [
    "verification.view",
    "verification.approve",
    "partners.suspend",
  ],
};

export default function AdminRolesPage() {
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Promote user modal state
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteUserId, setPromoteUserId] = useState("");
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

  // Queries
  const { data: admins, isLoading: adminsLoading } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => apiClient.get<AdminAccount[]>("/api/v1/admin/admins", { auth: true }),
    retry: false,
  });

  const { data: catalog } = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: () => apiClient.get<PermissionCategory[]>("/api/v1/admin/permissions/catalog", { auth: true }),
    retry: false,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });

  const allPermissionIds = (catalog ?? []).flatMap((c) => c.permissions.map((p) => p.id));

  const handleOpenEdit = (admin: AdminAccount) => {
    setEditingAdmin(admin);
    setSelectedRole(admin.system_role);
    setSelectedPreset(admin.admin_permission_role ?? "");
    setSaveError(null);

    if (admin.system_role === "super_admin") {
      setSelectedPermissions([...allPermissionIds]);
    } else if (admin.admin_permissions && admin.admin_permissions.length > 0) {
      setSelectedPermissions([...admin.admin_permissions]);
    } else if (admin.admin_permission_role && PRESET_PERMISSIONS[admin.admin_permission_role]) {
      setSelectedPermissions([...PRESET_PERMISSIONS[admin.admin_permission_role]]);
    } else {
      // Legacy unrestricted admin: default to all checked
      setSelectedPermissions([...allPermissionIds]);
    }
  };

  const handleTogglePermission = (id: string) => {
    setSelectedPreset("");
    setSelectedPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleToggleCategory = (category: PermissionCategory) => {
    setSelectedPreset("");
    const categoryIds = category.permissions.map((p) => p.id);
    const allSelected = categoryIds.every((id) => selectedPermissions.includes(id));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((id) => !categoryIds.includes(id)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...categoryIds])));
    }
  };

  const applyPreset = (presetKey: string) => {
    setSelectedPreset(presetKey);
    if (presetKey === "all") {
      setSelectedPermissions([...allPermissionIds]);
    } else if (presetKey === "none") {
      setSelectedPermissions([]);
    } else if (PRESET_PERMISSIONS[presetKey]) {
      setSelectedPermissions([...PRESET_PERMISSIONS[presetKey]]);
    }
  };

  const handleSavePermissions = async () => {
    if (!editingAdmin) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.post(
        `/api/v1/admin/admins/${editingAdmin.id}/permissions`,
        {
          system_role: selectedRole,
          admin_permission_role: selectedPreset in PRESET_PERMISSIONS ? selectedPreset : null,
          admin_permissions: selectedRole === "super_admin" ? null : selectedPermissions,
        },
        { auth: true }
      );
      setEditingAdmin(null);
      refetch();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to update permissions");
    } finally {
      setSaving(false);
    }
  };

  const handlePromoteUser = async () => {
    if (!promoteUserId.trim()) return;
    setPromoting(true);
    setPromoteError(null);
    try {
      await apiClient.post(
        `/api/v1/admin/admins/${promoteUserId.trim()}/permissions`,
        {
          system_role: "admin",
          admin_permission_role: null,
          admin_permissions: PRESET_PERMISSIONS.moderator,
        },
        { auth: true }
      );
      setShowPromoteModal(false);
      setPromoteUserId("");
      refetch();
    } catch (err) {
      setPromoteError(err instanceof ApiError ? err.message : "Failed to promote user. Check User UUID.");
    } finally {
      setPromoting(false);
    }
  };

  if (currentUser?.system_role !== "super_admin") {
    return (
      <div className="py-12 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Access Restricted</h1>
        <p className="mt-2 text-sm text-zinc-500">Only Super Admins can manage admin permissions and role access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary-600" /> Super Admin Access & Permissions Matrix
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Grant or restrict specific feature permissions for any administrator or moderator across the entire Ovigo platform.
          </p>
        </div>

        <Button size="sm" onClick={() => setShowPromoteModal(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Promote / Add Admin
        </Button>
      </div>

      {adminsLoading && <Spinner className="mt-6" />}

      {/* Admin Accounts List */}
      <div className="grid grid-cols-1 gap-4">
        {(admins ?? []).map((admin) => {
          const isSuper = admin.system_role === "super_admin";
          const permCount = admin.admin_permissions?.length ?? (admin.admin_permission_role ? PRESET_PERMISSIONS[admin.admin_permission_role]?.length : allPermissionIds.length);

          return (
            <Card key={admin.id} className="flex flex-wrap items-center justify-between gap-4 border border-zinc-200/90 shadow-sm dark:border-zinc-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{admin.full_name}</h3>
                  <Badge variant={isSuper ? "primary" : "accent"} className="text-xs">
                    {isSuper ? "Super Admin" : "Admin / Moderator"}
                  </Badge>
                  {!admin.is_active && (
                    <Badge variant="danger" className="text-xs">
                      Suspended
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {admin.email ?? admin.phone} · ID: <span className="font-mono text-[10px] text-zinc-400">{admin.id}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-zinc-500">Effective Permissions:</span>
                  {isSuper ? (
                    <span className="font-semibold text-primary-600 dark:text-primary-400">All Features (Unrestricted)</span>
                  ) : admin.admin_permissions && admin.admin_permissions.length > 0 ? (
                    <Badge variant="neutral" className="text-xs">
                      {admin.admin_permissions.length} Custom Feature Permissions
                    </Badge>
                  ) : admin.admin_permission_role ? (
                    <Badge variant="warning" className="text-xs">
                      {ADMIN_PERMISSION_ROLE_LABELS[admin.admin_permission_role]} ({permCount} perms)
                    </Badge>
                  ) : (
                    <span className="text-zinc-600 dark:text-zinc-400 font-medium">Legacy Full Access</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(admin)}>
                  <KeyRound className="h-3.5 w-3.5 mr-1 text-primary-600" /> Configure Permissions
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Permissions Configuration Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 p-5 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary-600" />
                  Configure Access: {editingAdmin.full_name}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {editingAdmin.email ?? editingAdmin.phone} · Select specific permissions to allow or restrict this user.
                </p>
              </div>
              <button
                onClick={() => setEditingAdmin(null)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Role Selection */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex-1 min-w-[12rem]">
                  <label className="text-xs font-semibold uppercase text-zinc-600 dark:text-zinc-400">Account System Role</label>
                  <Select
                    value={selectedRole}
                    onChange={(e) => {
                      const role = e.target.value;
                      setSelectedRole(role);
                      if (role === "super_admin") {
                        setSelectedPermissions([...allPermissionIds]);
                      }
                    }}
                    className="mt-1"
                  >
                    <option value="admin">Admin / Moderator</option>
                    <option value="super_admin">Super Admin (Unrestricted Full Access)</option>
                  </Select>
                </div>
                <div className="flex-1 min-w-[16rem]">
                  <p className="text-xs text-zinc-500">
                    {selectedRole === "super_admin"
                      ? "Super Admins have universal platform access and bypass all granular restrictions."
                      : "Standard Admins and Moderators will be strictly gated to the checkboxes selected below."}
                  </p>
                </div>
              </div>

              {/* Presets Quick Toolbar */}
              {selectedRole !== "super_admin" && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      Quick Role Presets
                    </label>
                    <span className="text-xs text-zinc-500">
                      Selected: <strong className="text-primary-600">{selectedPermissions.length}</strong> / {allPermissionIds.length} permissions
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant={selectedPreset === "all" ? "primary" : "secondary"} onClick={() => applyPreset("all")} className="text-xs">
                      Full Access (All)
                    </Button>
                    <Button size="sm" variant={selectedPreset === "moderator" ? "primary" : "secondary"} onClick={() => applyPreset("moderator")} className="text-xs">
                      Content Moderator
                    </Button>
                    <Button size="sm" variant={selectedPreset === "verification_team" ? "primary" : "secondary"} onClick={() => applyPreset("verification_team")} className="text-xs">
                      KYC Verification Team
                    </Button>
                    <Button size="sm" variant={selectedPreset === "finance_admin" ? "primary" : "secondary"} onClick={() => applyPreset("finance_admin")} className="text-xs">
                      Finance Admin
                    </Button>
                    <Button size="sm" variant={selectedPreset === "operations_admin" ? "primary" : "secondary"} onClick={() => applyPreset("operations_admin")} className="text-xs">
                      Operations Admin
                    </Button>
                    <Button size="sm" variant={selectedPreset === "support" ? "primary" : "secondary"} onClick={() => applyPreset("support")} className="text-xs">
                      Support Agent
                    </Button>
                    <Button size="sm" variant={selectedPreset === "none" ? "destructive" : "ghost"} onClick={() => applyPreset("none")} className="text-xs ml-auto">
                      Restrict All (0 Perms)
                    </Button>
                  </div>
                </div>
              )}

              {/* Permission Categories Grid */}
              {selectedRole !== "super_admin" && (
                <div className="space-y-4">
                  {(catalog ?? []).map((cat) => {
                    const catIds = cat.permissions.map((p) => p.id);
                    const selectedCount = catIds.filter((id) => selectedPermissions.includes(id)).length;
                    const allSelected = catIds.length > 0 && selectedCount === catIds.length;

                    return (
                      <div key={cat.category} className="rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 shadow-sm">
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">{cat.category}</span>
                            <Badge variant={selectedCount === catIds.length ? "success" : selectedCount > 0 ? "warning" : "neutral"} className="text-[10px]">
                              {selectedCount} / {catIds.length} enabled
                            </Badge>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(cat)}
                            className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                          >
                            {allSelected ? "Deselect All" : "Select All"}
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {cat.permissions.map((perm) => {
                            const isChecked = selectedPermissions.includes(perm.id);

                            return (
                              <label
                                key={perm.id}
                                className={cn(
                                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all text-xs",
                                  isChecked
                                    ? "border-primary-300 bg-primary-50/40 dark:border-primary-800 dark:bg-primary-950/20"
                                    : "border-zinc-200 bg-zinc-50/40 hover:bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/40"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleTogglePermission(perm.id)}
                                  className="mt-0.5 rounded border-zinc-300 text-primary-600 focus:ring-primary-500 dark:border-zinc-700"
                                />
                                <div className="min-w-0">
                                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{perm.label}</p>
                                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{perm.description}</p>
                                  <span className="inline-block mt-1 font-mono text-[10px] text-zinc-400">code: {perm.id}</span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {saveError && (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
                  {saveError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 p-4 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40">
              <Button variant="ghost" onClick={() => setEditingAdmin(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSavePermissions} loading={saving}>
                Save Permissions
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Promote User Modal */}
      {showPromoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Promote User to Admin / Moderator</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Provide the User UUID of any registered user to promote them to Administrator. You can customize their exact permissions immediately after promotion.
            </p>
            <div className="mt-4 space-y-3">
              <Input
                label="User UUID"
                value={promoteUserId}
                onChange={(e) => setPromoteUserId(e.target.value)}
                placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                required
              />
              {promoteError && <p className="text-xs text-red-600">{promoteError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowPromoteModal(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handlePromoteUser} loading={promoting} disabled={!promoteUserId.trim()}>
                  Confirm Promotion
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
