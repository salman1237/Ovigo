"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  ShieldAlert,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  ASSIGNMENT_STATUS_LABELS,
  Assignment,
  Availability,
  GUIDE_CERTIFICATION_LABELS,
  GuideCertification,
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

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card variant="elevated">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {icon && <span className="text-primary-600 dark:text-primary-400">{icon}</span>}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function GuideDashboardPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

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

  const { data: certification } = useQuery({
    queryKey: ["guides", "certification", "mine"],
    queryFn: () => apiClient.get<GuideCertification>("/api/v1/guides/certification/mine", { auth: true }),
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
    const ok = await confirm({
      title: "End supervision of this guide?",
      description: "This can't be undone. You'll no longer be supervised by this expert.",
      confirmLabel: "End supervision",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
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
        <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          <Compass className="h-6 w-6 text-primary-600 dark:text-primary-400" /> Guide Dashboard
        </h1>
        <p className="mt-4 text-sm text-zinc-500">
          This is for approved Guides only — a Local Expert needs to invite you first.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        <Compass className="h-6 w-6 text-primary-600 dark:text-primary-400" /> Guide Dashboard
      </h1>

      {supervisionLoading && (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      )}

      {!supervisionLoading && !supervision && (
        <div className="mt-4">
          <EmptyState title="No supervision invitation yet" description="A Local Expert needs to invite you first." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {supervision && (
          <Section title="Supervision" icon={<ShieldAlert className="h-4 w-4" />}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                Supervised by {supervision.expert.full_name}
              </p>
              <Badge variant={supervision.status === "accepted" ? "success" : supervision.status === "rejected" || supervision.status === "terminated" ? "danger" : "neutral"} className="capitalize">
                {SUPERVISION_STATUS_LABELS[supervision.status]}
              </Badge>
            </div>
            {supervision.status === "pending" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => respond(true)}>
                  Accept
                </Button>
                <Button size="sm" variant="destructive" onClick={() => respond(false)}>
                  Decline
                </Button>
              </div>
            )}
            {supervision.status === "accepted" && (
              <button onClick={terminate} className="mt-3 text-xs font-medium text-red-600 hover:text-red-700">
                End supervision
              </button>
            )}
          </Section>
        )}

        {earnings && (
          <Section title="Earnings" icon={<Wallet className="h-4 w-4" />}>
            <p className="text-xs text-zinc-500">Informational — settled directly with your expert.</p>
            <p className="mt-1 text-lg font-semibold text-primary-600 dark:text-primary-400">
              {formatMoney(earnings.total_fees)}
            </p>
            <p className="text-xs text-zinc-400">{earnings.total_completed_assignments} completed assignment(s)</p>
          </Section>
        )}

        {certification && (
          <Section title="Certification" icon={<Award className="h-4 w-4" />}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">Level</p>
              <Badge variant={certification.level === "level_2" ? "success" : certification.level === "level_1" ? "primary" : "neutral"}>
                {GUIDE_CERTIFICATION_LABELS[certification.level]}
              </Badge>
            </div>
            {certification.specialty && (
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">Specialty: {certification.specialty}</p>
            )}
            {certification.is_restricted && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Restricted from high-risk activity assignments
                {certification.restriction_reason && ` — ${certification.restriction_reason}`}
              </p>
            )}
          </Section>
        )}

        {supervision && (
          <Section title="Availability (next 60 days)" icon={<CalendarClock className="h-4 w-4" />}>
            <p className="text-xs text-zinc-500">Mark specific dates you know you won&apos;t be available.</p>
            <div className="mt-2 flex gap-2">
              <Input type="date" value={blockDate} min={today()} max={daysFromNow(60)} onChange={(e) => setBlockDate(e.target.value)} />
              <Button size="sm" variant="secondary" onClick={toggleUnavailable} disabled={!blockDate}>
                Mark unavailable
              </Button>
            </div>
            {(availability ?? []).filter((a) => !a.is_available).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(availability ?? [])
                  .filter((a) => !a.is_available)
                  .map((a) => (
                    <Badge key={a.date} variant="danger" className="gap-1.5">
                      {a.date}
                      <button onClick={() => markAvailable(a.date)} className="hover:text-red-900 dark:hover:text-red-100">
                        ×
                      </button>
                    </Badge>
                  ))}
              </div>
            )}
          </Section>
        )}

        <Section title="My Assignments" icon={<ClipboardCheck className="h-4 w-4" />}>
          <ul className="flex flex-col gap-2">
            {(assignments ?? []).map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {a.departure.tour_title} — {a.departure.departure_date}
                  </p>
                  <Badge variant={a.status === "completed" ? "success" : a.status === "cancelled" ? "danger" : "neutral"} className="shrink-0 capitalize">
                    {ASSIGNMENT_STATUS_LABELS[a.status]}
                  </Badge>
                </div>
                {a.fee_amount && <p className="text-xs text-zinc-500">Fee: {formatMoney(a.fee_amount)}</p>}
                {(a.status === "assigned" || a.status === "checked_in") && (
                  <div className="flex gap-2">
                    {a.status === "assigned" && (
                      <Button size="sm" variant="secondary" onClick={() => checkIn(a.id)}>
                        Check in
                      </Button>
                    )}
                    {a.status === "checked_in" && (
                      <Button size="sm" variant="secondary" onClick={() => complete(a.id)}>
                        <CheckCircle2 className="h-4 w-4" /> Complete
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
            {(assignments ?? []).length === 0 && <p className="text-sm text-zinc-400">No assignments yet.</p>}
          </ul>
        </Section>
      </div>
    </div>
  );
}
