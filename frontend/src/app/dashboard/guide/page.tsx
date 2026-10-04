"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { Award, CheckCircle2, ClipboardCheck, Compass, ShieldAlert, Users, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { EarningsSummary } from "@/types/earnings";
import {
  ASSIGNMENT_STATUS_LABELS,
  Assignment,
  GUIDE_CERTIFICATION_LABELS,
  GuideCertification,
  SUPERVISION_STATUS_LABELS,
  Supervision,
} from "@/types/guides";

import { GuideServicesPanel } from "./_components/GuideServicesPanel";

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

  // A guide can work with several experts (Phase 9.3).
  const {
    data: supervisions,
    isLoading: supervisionsLoading,
    isError: supervisionsError,
    error: supervisionsErr,
  } = useQuery({
    queryKey: ["guides", "my-supervisions"],
    queryFn: () => apiClient.get<Supervision[]>("/api/v1/guides/my-supervisions", { auth: true }),
    retry: false,
  });

  const { data: assignments } = useQuery({
    queryKey: ["guides", "my-assignments"],
    queryFn: () => apiClient.get<Assignment[]>("/api/v1/guides/assignments/mine", { auth: true }),
    retry: false,
  });

  // 403 until Ovigo approves the guide role.
  const { data: earnings, isError: earningsError } = useQuery({
    queryKey: ["earnings", "/api/v1/partners/earnings/guide"],
    queryFn: () => apiClient.get<EarningsSummary>("/api/v1/partners/earnings/guide", { auth: true }),
    retry: false,
  });

  const { data: certification } = useQuery({
    queryKey: ["guides", "certification", "mine"],
    queryFn: () => apiClient.get<GuideCertification>("/api/v1/guides/certification/mine", { auth: true }),
    retry: false,
  });

  const notEligible = supervisionsError && supervisionsErr instanceof ApiError && supervisionsErr.status === 403;
  const roleApproved = !!earnings && !earningsError;
  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["guides"] });
    queryClient.invalidateQueries({ queryKey: ["earnings"] });
  };

  const respond = async (supervision: Supervision, accept: boolean) => {
    await apiClient.post(`/api/v1/guides/supervisions/${supervision.id}/respond`, { accept }, { auth: true });
    refetch();
  };

  const terminate = async (supervision: Supervision) => {
    const ok = await confirm({
      title: `Stop working with ${supervision.expert.full_name}?`,
      description: "They won't be able to assign you to their tours any more. Your other experts aren't affected.",
      confirmLabel: "Stop working together",
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
          This is for Guides. Apply as a guide from{" "}
          <Link href="/account/partner" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            your partner account
          </Link>
          , or ask a Local Expert to invite you.
        </p>
      </div>
    );
  }

  const visibleSupervisions = (supervisions ?? []).filter((s) => s.status === "pending" || s.status === "accepted");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        <Compass className="h-6 w-6 text-primary-600 dark:text-primary-400" /> Guide Dashboard
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Get hired by Local Experts for their tours, and get booked directly by travelers.
      </p>

      {supervisionsLoading && (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <Section title="Earnings" icon={<Wallet className="h-4 w-4" />}>
          {earnings ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Stat label="Pending" value={earnings.total_net_pending} />
                <Stat label="Payable" value={earnings.total_net_payable} highlight />
                <Stat label="Paid out" value={earnings.total_net_paid} />
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Paid through Ovigo, after its 12% commission. A fee from an expert becomes payable once their tour&apos;s
                bookings are complete; a traveler&apos;s booking once it&apos;s complete.{" "}
                <Link href="/dashboard/earnings" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  Details →
                </Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Your earnings appear here once Ovigo approves your guide role.</p>
          )}
        </Section>

        <Section title="Experts you work with" icon={<Users className="h-4 w-4" />}>
          {!supervisionsLoading && visibleSupervisions.length === 0 && (
            <EmptyState
              title="No experts yet"
              description="Local Experts can invite you to guide their tours. You can work with several at once."
            />
          )}
          <ul className="flex flex-col gap-2">
            {visibleSupervisions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{s.expert.full_name}</p>
                <div className="flex items-center gap-2">
                  {s.status === "pending" ? (
                    <>
                      <Button size="sm" onClick={() => respond(s, true)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => respond(s, false)}>
                        Decline
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="success">{SUPERVISION_STATUS_LABELS[s.status]}</Badge>
                      <button onClick={() => terminate(s)} className="text-xs font-medium text-red-600 hover:text-red-700">
                        End
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Tour assignments" icon={<ClipboardCheck className="h-4 w-4" />}>
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
                  <Badge
                    variant={a.status === "completed" ? "success" : a.status === "cancelled" ? "danger" : "neutral"}
                    className="shrink-0 capitalize"
                  >
                    {ASSIGNMENT_STATUS_LABELS[a.status]}
                  </Badge>
                </div>
                {a.fee_amount && Number(a.fee_amount) > 0 && (
                  <p className="text-xs text-zinc-500">
                    Fee {formatMoney(a.fee_amount)}
                    {a.package && ` (${a.package.name})`} · paid through Ovigo
                  </p>
                )}
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

        <GuideServicesPanel roleApproved={roleApproved} assignments={assignments ?? []} />

        {certification && (
          <Section title="Certification" icon={<Award className="h-4 w-4" />}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">Level</p>
              <Badge
                variant={certification.level === "level_2" ? "success" : certification.level === "level_1" ? "primary" : "neutral"}
              >
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
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-semibold ${highlight ? "text-emerald-600" : "text-zinc-900 dark:text-zinc-50"}`}>{formatMoney(value)}</p>
    </div>
  );
}
