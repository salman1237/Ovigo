"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import {
  GUIDE_CERTIFICATION_LABELS,
  GuideAdminSummary,
  GuideCertificationLevel,
} from "@/types/guides";

export default function AdminGuidesPage() {
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [level, setLevel] = useState<GuideCertificationLevel>("none");
  const [specialty, setSpecialty] = useState("");
  const [restrictingId, setRestrictingId] = useState<string | null>(null);
  const [restrictionReason, setRestrictionReason] = useState("");
  const queryClient = useQueryClient();

  const { data: guides, isLoading, isError } = useQuery({
    queryKey: ["admin-guides"],
    queryFn: () => apiClient.get<GuideAdminSummary[]>("/api/v1/admin/guides", { auth: true }),
    retry: false,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-guides"] });

  const startEditing = (g: GuideAdminSummary) => {
    setEditingId(g.role.id);
    setLevel(g.certification.level);
    setSpecialty(g.certification.specialty ?? "");
  };

  const saveCertification = async (roleId: string) => {
    setError(null);
    try {
      await apiClient.put(
        `/api/v1/admin/guides/${roleId}/certification`,
        { level, specialty: specialty || null },
        { auth: true }
      );
      setEditingId(null);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update certification");
    }
  };

  const startRestricting = (g: GuideAdminSummary) => {
    setRestrictingId(g.role.id);
    setRestrictionReason(g.certification.restriction_reason ?? "");
  };

  const toggleRestriction = async (roleId: string, isRestricted: boolean) => {
    setError(null);
    try {
      await apiClient.put(
        `/api/v1/admin/guides/${roleId}/restriction`,
        { is_restricted: isRestricted, restriction_reason: isRestricted ? restrictionReason || null : null },
        { auth: true }
      );
      setRestrictingId(null);
      setRestrictionReason("");
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update restriction");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Guides</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Certification level gates assignment to departures with a high-risk activity — only Level 2 guides can be
        assigned to one. Restricting a guide blocks high-risk assignments specifically, without suspending their
        role entirely.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {isLoading && <Spinner />}
      {isError && <p className="mt-4 text-sm text-red-600">Failed to load guides.</p>}
      {!isLoading && (guides ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No guides yet" />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(guides ?? []).map((g) => (
          <Card key={g.role.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{g.role.full_name}</p>
                <p className="text-xs text-zinc-500">
                  {g.role.email} · {g.role_status} · {g.total_completed_assignments} completed assignment(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={g.certification.level === "level_2" ? "success" : g.certification.level === "level_1" ? "primary" : "neutral"}>
                  {GUIDE_CERTIFICATION_LABELS[g.certification.level]}
                  {g.certification.specialty ? ` · ${g.certification.specialty}` : ""}
                </Badge>
                {g.certification.is_restricted && <Badge variant="danger">Restricted</Badge>}
              </div>
            </div>

            {editingId !== g.role.id && restrictingId !== g.role.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => startEditing(g)}>
                  Edit certification
                </Button>
                {g.certification.is_restricted ? (
                  <Button size="sm" variant="secondary" onClick={() => toggleRestriction(g.role.id, false)}>
                    Remove restriction
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => startRestricting(g)}>
                    Restrict from high-risk activities
                  </Button>
                )}
              </div>
            )}

            {editingId === g.role.id && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Select value={level} onChange={(e) => setLevel(e.target.value as GuideCertificationLevel)} className="w-auto">
                  {(Object.keys(GUIDE_CERTIFICATION_LABELS) as GuideCertificationLevel[]).map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {GUIDE_CERTIFICATION_LABELS[lvl]}
                    </option>
                  ))}
                </Select>
                <input
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="Specialty (optional, e.g. Wild Safari)"
                  className="h-9 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <Button size="sm" onClick={() => saveCertification(g.role.id)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            )}

            {restrictingId === g.role.id && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <input
                  value={restrictionReason}
                  onChange={(e) => setRestrictionReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="h-9 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <Button size="sm" variant="destructive" onClick={() => toggleRestriction(g.role.id, true)}>
                  Confirm restriction
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRestrictingId(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
