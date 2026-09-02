"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Staff Invitations</h1>
      <p className="mt-1 text-sm text-zinc-500">Properties that have invited you onto their staff.</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-col gap-3">
        {isLoading && <Spinner />}
        {!isLoading && (memberships ?? []).length === 0 && (
          <EmptyState title="No invitations" description="You haven't been invited to any property's staff yet." />
        )}
        {(memberships ?? []).map((m) => (
          <Card key={m.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{m.property_name}</p>
                <p className="text-xs text-zinc-500">{STAFF_ROLE_LABELS[m.staff_role]}</p>
              </div>
              <Badge variant={m.status === "active" ? "success" : m.status === "revoked" ? "neutral" : "primary"}>
                {m.status}
              </Badge>
            </div>
            {m.status === "pending" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => respond(m.id, true)}>Accept</Button>
                <Button size="sm" variant="ghost" onClick={() => respond(m.id, false)}>Decline</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
