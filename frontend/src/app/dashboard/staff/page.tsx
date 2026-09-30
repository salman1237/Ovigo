"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Users, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { Staff, STAFF_ROLE_LABELS } from "@/types/stay";

export default function MyStaffInvitationsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: memberships, isLoading } = useQuery({
    queryKey: ["my-staff-memberships"],
    queryFn: () => apiClient.get<Staff[]>("/api/v1/staff/my-invitations", { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["my-staff-memberships"] });

  const respond = async (staffId: string, accept: boolean) => {
    setError(null);
    try {
      await apiClient.post(`/api/v1/staff/${staffId}/respond?accept=${accept}`, undefined, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">Staff Invitations</h1>
      <p className="mt-1 text-sm text-zinc-500">Properties that have invited you onto their staff.</p>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-8">
        <Card variant="elevated">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <span className="text-primary-600 dark:text-primary-400">
              <Users className="h-4 w-4" />
            </span>
            Invitations
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            {isLoading && <Spinner />}
            {!isLoading && (memberships ?? []).length === 0 && (
              <EmptyState title="No invitations" description="You haven't been invited to any property's staff yet." />
            )}
            {(memberships ?? []).map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{m.property_name}</p>
                  <p className="text-xs text-zinc-500">{STAFF_ROLE_LABELS[m.staff_role]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.status === "active" ? "success" : m.status === "revoked" ? "neutral" : "primary"}>
                    {m.status}
                  </Badge>
                  {m.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => respond(m.id, true)}>
                        <Check className="h-3.5 w-3.5" />
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => respond(m.id, false)}>
                        <X className="h-3.5 w-3.5" />
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
