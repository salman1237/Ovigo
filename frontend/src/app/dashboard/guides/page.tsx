"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="Guide's email"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={invite}
          disabled={inviteBusy || !inviteEmail}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          Invite
        </button>
      </div>
      {inviteError && <p className="mt-1 text-sm text-red-600">{inviteError}</p>}

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}

      <div className="mt-6 flex flex-col gap-3">
        {(guides ?? []).map((s) => (
          <GuideCard key={s.id} supervision={s} departures={departures} onChange={refetch} />
        ))}
        {!isLoading && (guides ?? []).length === 0 && (
          <p className="text-sm text-zinc-400">You haven&apos;t invited any guides yet.</p>
        )}
      </div>

      {(assignments ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Assignments</h2>
          <div className="mt-2 flex flex-col gap-2">
            {(assignments ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
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
                  <button onClick={() => cancelAssignment(a.id)} className="text-xs text-red-600 hover:underline">
                    Cancel
                  </button>
                )}
              </div>
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
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{supervision.guide.full_name}</h3>
          <p className="text-xs text-zinc-500">{supervision.guide.email}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {SUPERVISION_STATUS_LABELS[supervision.status]}
          {supervision.status === "accepted" && !supervision.guide_role_approved && " (role pending admin approval)"}
        </span>
      </div>

      {canAssign && (
        <div className="mt-3">
          {!showAssign && (
            <button
              onClick={() => setShowAssign(true)}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium dark:border-zinc-700"
            >
              Assign to a departure
            </button>
          )}
          {showAssign && (
            <div className="flex flex-col gap-2">
              <select
                value={departureId}
                onChange={(e) => setDepartureId(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Select a departure…</option>
                {departures.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="Fee you'll pay the guide (optional)"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={assign}
                  disabled={busy}
                  className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                >
                  Assign
                </button>
                <button onClick={() => setShowAssign(false)} className="text-xs text-zinc-500">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
