"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  ASSIGNMENT_STATUS_LABELS,
  Assignment,
  SUPERVISION_STATUS_LABELS,
  Supervision,
} from "@/types/guides";
import type { Tour } from "@/types/tour";

export default function MyGuidesPage() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const { data: guides, isLoading, isError, error } = useQuery({
    queryKey: ["guides", "my-guides"],
    queryFn: () => apiClient.get<Supervision[]>("/api/v1/guides/my-guides", { auth: true }),
    retry: false,
  });

  const { data: assignments } = useQuery({
    queryKey: ["guides", "assigned-by-me"],
    queryFn: () => apiClient.get<Assignment[]>("/api/v1/guides/assignments/assigned-by-me", { auth: true }),
    retry: false,
  });

  const { data: myTours } = useQuery({
    queryKey: ["tours", "mine"],
    queryFn: () => apiClient.get<Tour[]>("/api/v1/tours/mine", { auth: true }),
  });

  const notEligible = isError && error instanceof ApiError && error.status === 403;
  const refetch = () => queryClient.invalidateQueries({ queryKey: ["guides"] });

  const invite = async () => {
    setInviteError(null);
    setInviteBusy(true);
    try {
      await apiClient.post("/api/v1/guides/invite", { email: inviteEmail }, { auth: true });
      setInviteEmail("");
      refetch();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to invite");
    } finally {
      setInviteBusy(false);
    }
  };

  const cancelAssignment = async (id: string) => {
    await apiClient.post(`/api/v1/guides/assignments/${id}/cancel`, undefined, { auth: true });
    refetch();
  };

  if (notEligible) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My Guides</h1>
        <p className="mt-4 text-sm text-zinc-500">This is for approved Local Experts only.</p>
      </div>
    );
  }

  const departures = (myTours ?? []).flatMap((t) =>
    t.departures.map((d) => ({ id: d.id, label: `${t.title} — ${d.departure_date}` }))
  );

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My Guides</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Invite someone who already has an Ovigo account to be your supervised Guide.
      </p>

      <div className="mt-4 flex gap-2">
        <Input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="Guide's email"
          className="flex-1"
        />
        <Button onClick={invite} loading={inviteBusy} disabled={!inviteEmail}>
          Invite
        </Button>
      </div>
      {inviteError && <p className="mt-1 text-sm text-red-600">{inviteError}</p>}

      {isLoading && <Spinner />}

      <div className="mt-6 flex flex-col gap-3">
        {(guides ?? []).map((s) => (
          <GuideCard key={s.id} supervision={s} departures={departures} onChange={refetch} />
        ))}
        {!isLoading && (guides ?? []).length === 0 && (
          <EmptyState title="No guides invited yet" description="Invite someone by email above." />
        )}
      </div>

      {(assignments ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Assignments</h2>
          <div className="mt-2 flex flex-col gap-2">
            {(assignments ?? []).map((a) => (
              <Card key={a.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {a.guide.full_name} → {a.departure.tour_title} ({a.departure.departure_date})
                  </p>
                  <p className="text-xs text-zinc-500">
                    {ASSIGNMENT_STATUS_LABELS[a.status]}
                    {a.fee_amount && ` · Fee: ${formatMoney(a.fee_amount)}`}
                  </p>
                </div>
                {(a.status === "assigned" || a.status === "checked_in") && (
                  <button onClick={() => cancelAssignment(a.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
                    Cancel
                  </button>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GuideCard({
  supervision,
  departures,
  onChange,
}: {
  supervision: Supervision;
  departures: { id: string; label: string }[];
  onChange: () => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [departureId, setDepartureId] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canAssign = supervision.status === "accepted" && supervision.guide_role_approved;

  const assign = async () => {
    setError(null);
    if (!departureId) {
      setError("Pick a departure to assign this guide to.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(
        `/api/v1/guides/${supervision.guide.id}/assignments`,
        { tour_departure_id: departureId, fee_amount: fee || undefined },
        { auth: true }
      );
      setShowAssign(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{supervision.guide.full_name}</h3>
          <p className="text-xs text-zinc-500">{supervision.guide.email}</p>
        </div>
        <Badge>
          {SUPERVISION_STATUS_LABELS[supervision.status]}
          {supervision.status === "accepted" && !supervision.guide_role_approved && " (role pending admin approval)"}
        </Badge>
      </div>

      {canAssign && (
        <div className="mt-3">
          {!showAssign && (
            <Button size="sm" variant="secondary" onClick={() => setShowAssign(true)}>
              Assign to a departure
            </Button>
          )}
          {showAssign && (
            <div className="flex flex-col gap-2">
              <Select value={departureId} onChange={(e) => setDepartureId(e.target.value)}>
                <option value="">Select a departure…</option>
                {departures.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Fee you'll pay the guide (optional)" />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={assign} loading={busy}>
                  Assign
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAssign(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
