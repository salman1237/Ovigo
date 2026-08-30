"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  ASSIGNMENT_STATUS_LABELS,
  Assignment,
  Availability,
  GuideEarnings,
  SUPERVISION_STATUS_LABELS,
  Supervision,
} from "@/types/guides";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function GuideDashboardPage() {
  const queryClient = useQueryClient();

  const {
    data: supervision,
    isLoading: supervisionLoading,
    isError: supervisionError,
    error: supervisionErr,
  } = useQuery({
    queryKey: ["guides", "my-supervision"],
    queryFn: () => apiClient.get<Supervision | null>("/api/v1/guides/my-supervision", { auth: true }),
    retry: false,
  });

  const { data: assignments } = useQuery({
    queryKey: ["guides", "my-assignments"],
    queryFn: () => apiClient.get<Assignment[]>("/api/v1/guides/assignments/mine", { auth: true }),
    retry: false,
  });

  const { data: earnings } = useQuery({
    queryKey: ["guides", "earnings"],
    queryFn: () => apiClient.get<GuideEarnings>("/api/v1/guides/earnings", { auth: true }),
    retry: false,
  });

  const { data: availability } = useQuery({
    queryKey: ["guides", "availability"],
    queryFn: () =>
      apiClient.get<Availability[]>(
        `/api/v1/guides/availability?start=${today()}&end=${daysFromNow(60)}`,
        { auth: true }
      ),
    retry: false,
    enabled: !!supervision,
  });

  const [blockDate, setBlockDate] = useState("");

  const toggleUnavailable = async () => {
    if (!blockDate) return;
    await apiClient.put("/api/v1/guides/availability", { dates: [blockDate], is_available: false }, { auth: true });
    setBlockDate("");
    refetch();
  };

  const markAvailable = async (dateStr: string) => {
    await apiClient.put("/api/v1/guides/availability", { dates: [dateStr], is_available: true }, { auth: true });
    refetch();
  };

  const notEligible = supervisionError && supervisionErr instanceof ApiError && supervisionErr.status === 403;
  const refetch = () => queryClient.invalidateQueries({ queryKey: ["guides"] });

  const respond = async (accept: boolean) => {
    if (!supervision) return;
    await apiClient.post(`/api/v1/guides/supervisions/${supervision.id}/respond`, { accept }, { auth: true });
    refetch();
  };

  const terminate = async () => {
    if (!supervision) return;
    await apiClient.post(`/api/v1/guides/supervisions/${supervision.id}/terminate`, undefined, { auth: true });
    refetch();
  };

  const checkIn = async (id: string) => {
    await apiClient.post(`/api/v1/guides/assignments/${id}/check-in`, undefined, { auth: true });
    refetch();
  };

  const complete = async (id: string) => {
    await apiClient.post(`/api/v1/guides/assignments/${id}/complete`, undefined, { auth: true });
    refetch();
  };

  if (notEligible) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Guide Dashboard</h1>
        <p className="mt-4 text-sm text-zinc-500">
          This is for approved Guides only — a Local Expert needs to invite you first.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Guide Dashboard</h1>

      {supervisionLoading && <p className="mt-4 text-sm text-zinc-400">Loading…</p>}

      {!supervisionLoading && !supervision && (
        <p className="mt-4 text-sm text-zinc-500">No supervision invitation yet.</p>
      )}

      {supervision && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            Supervised by {supervision.expert.full_name}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{SUPERVISION_STATUS_LABELS[supervision.status]}</p>
          {supervision.status === "pending" && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => respond(true)}
                className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Accept
              </button>
              <button
                onClick={() => respond(false)}
                className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
              >
                Decline
              </button>
            </div>
          )}
          {supervision.status === "accepted" && (
            <button onClick={terminate} className="mt-3 text-xs text-red-600 hover:underline">
              End supervision
            </button>
          )}
        </div>
      )}

      {earnings && (
        <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Earnings (informational — settled directly with your expert)</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {formatMoney(earnings.total_fees)}
          </p>
          <p className="text-xs text-zinc-400">{earnings.total_completed_assignments} completed assignment(s)</p>
        </div>
      )}

      {supervision && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Availability (next 60 days)</h2>
          <p className="mt-1 text-xs text-zinc-500">Mark specific dates you know you won&apos;t be available.</p>
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              value={blockDate}
              min={today()}
              max={daysFromNow(60)}
              onChange={(e) => setBlockDate(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              onClick={toggleUnavailable}
              disabled={!blockDate}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Mark unavailable
            </button>
          </div>
          {(availability ?? []).filter((a) => !a.is_available).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(availability ?? [])
                .filter((a) => !a.is_available)
                .map((a) => (
                  <span
                    key={a.date}
                    className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300"
                  >
                    {a.date}
                    <button onClick={() => markAvailable(a.date)} className="text-red-600 hover:text-red-900 dark:text-red-400">
                      ×
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">My Assignments</h2>
        <div className="mt-2 flex flex-col gap-2">
          {(assignments ?? []).map((a) => (
            <div key={a.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {a.departure.tour_title} — {a.departure.departure_date}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {ASSIGNMENT_STATUS_LABELS[a.status]}
                {a.fee_amount && ` · Fee: ${formatMoney(a.fee_amount)}`}
              </p>
              <div className="mt-2 flex gap-2">
                {a.status === "assigned" && (
                  <button onClick={() => checkIn(a.id)} className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
                    Check in
                  </button>
                )}
                {a.status === "checked_in" && (
                  <button onClick={() => complete(a.id)} className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
                    Complete
                  </button>
                )}
              </div>
            </div>
          ))}
          {(assignments ?? []).length === 0 && <p className="text-sm text-zinc-400">No assignments yet.</p>}
        </div>
      </div>
    </div>
  );
}
