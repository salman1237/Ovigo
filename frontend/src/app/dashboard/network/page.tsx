"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, Link2, MessageCircle, RefreshCw, Share2, UsersRound } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { ROLE_LABELS } from "@/types/partner";
import {
  JOINABLE_ROLE_TYPES,
  MEMBER_STATUS_LABELS,
  MEMBER_STATUS_VARIANTS,
  SOURCE_LABELS,
  type JoinableRoleType,
  type NetworkMember,
  type NetworkMemberStatus,
  type ReferralLink,
} from "@/types/referrals";

const STATUS_FILTERS: { key: NetworkMemberStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default function NetworkPage() {
  const queryClient = useQueryClient();
  const { data: link, isLoading, isError, error } = useQuery({
    queryKey: ["referrals", "me"],
    queryFn: () => apiClient.get<ReferralLink>("/api/v1/referrals/me", { auth: true }),
    retry: false,
  });

  const notEligible = isError && error instanceof ApiError && error.status === 403;

  if (notEligible) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">My Network</h1>
        <p className="mt-4 text-sm text-zinc-500">Your referral link is available once you&apos;re an approved Local Expert.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">My Network</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Invite guides, homestays, hotels and rent-a-car operators with your personal link. When Ovigo approves
        them, you earn a referral commission on their completed bookings
        {link ? ` for ${link.attribution_months} months` : ""} — paid by Ovigo, never taken from their earnings.
      </p>

      {isLoading && <Spinner />}
      {isError && !notEligible && <ErrorState message="Couldn't load your referral link. Please try again." />}
      {link && (
        <>
          <LinkCard link={link} onRegenerated={() => queryClient.invalidateQueries({ queryKey: ["referrals"] })} />
          <StatsRow link={link} />
          <Members />
        </>
      )}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard blocked — the link is selectable text right next to the button
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function LinkCard({ link, onRegenerated }: { link: ReferralLink; onRegenerated: () => void }) {
  const confirm = useConfirm();
  const qrWrap = useRef<HTMLDivElement>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareText = `Join me on Ovigo — list your service and take bookings from travelers: ${link.url}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const downloadQr = () => {
    const canvas = qrWrap.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `ovigo-invite-${link.code}.png`;
    a.click();
  };

  const regenerate = async () => {
    const ok = await confirm({
      title: "Create a new referral link?",
      description:
        "Your current link and QR code stop working for new signups. Everyone who already joined stays in your network.",
      confirmLabel: "Create new link",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setRegenerating(true);
    try {
      await apiClient.post("/api/v1/referrals/me/regenerate", undefined, { auth: true });
      onRegenerated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create a new link");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Card variant="elevated" className="mt-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <Link2 className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            Your referral link
          </h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              {link.url}
            </code>
            <CopyButton text={link.url} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Code <span className="font-mono font-semibold tracking-wider text-zinc-700 dark:text-zinc-300">{link.code}</span>
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-full bg-emerald-600 px-4 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Share on WhatsApp
            </a>
            {canNativeShare && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigator.share({ title: "Join me on Ovigo", text: shareText, url: link.url }).catch(() => {})}
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={downloadQr}>
              <Download className="h-3.5 w-3.5" />
              Download QR
            </Button>
          </div>
        </div>

        <div ref={qrWrap} className="self-center rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700">
          <QRCodeCanvas value={link.url} size={132} marginSize={1} />
        </div>
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Links for a specific partner type</h3>
        <div className="mt-2 flex flex-col gap-2">
          {JOINABLE_ROLE_TYPES.map((rt: JoinableRoleType) => (
            <div key={rt} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">{ROLE_LABELS[rt]}</span>
              <CopyButton text={link.role_urls[rt]} label="Copy link" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">Link shared somewhere it shouldn&apos;t be? Replace it with a new one.</p>
        <Button size="sm" variant="ghost" onClick={regenerate} loading={regenerating}>
          <RefreshCw className="h-3.5 w-3.5" />
          New link
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "warning" }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold",
          tone === "success" ? "text-emerald-600" : tone === "warning" ? "text-amber-600" : "text-zinc-900 dark:text-zinc-50"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatsRow({ link }: { link: ReferralLink }) {
  const s = link.stats;
  return (
    <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Link visits" value={s.visits} />
      <Stat label="Joined via link" value={s.signups} />
      <Stat label="Pending approval" value={s.pending} tone={s.pending > 0 ? "warning" : undefined} />
      <Stat label="Active members" value={s.active} tone={s.active > 0 ? "success" : undefined} />
      <Stat label="Expiring in 30 days" value={s.expiring_soon} />
      <Stat label="Earnings pending" value={formatMoney(s.network_earnings_pending)} />
      <Stat label="Earnings payable" value={formatMoney(s.network_earnings_payable)} tone="success" />
      <Stat label="Earnings paid" value={formatMoney(s.network_earnings_paid)} />
    </div>
  );
}

function Members() {
  const [status, setStatus] = useState<NetworkMemberStatus | "all">("all");
  const [roleType, setRoleType] = useState<JoinableRoleType | "all">("all");

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (roleType !== "all") params.set("role_type", roleType);
  const qs = params.toString();

  const { data: members, isLoading, isError } = useQuery({
    queryKey: ["referrals", "members", status, roleType],
    queryFn: () => apiClient.get<NetworkMember[]>(`/api/v1/referrals/me/members${qs ? `?${qs}` : ""}`, { auth: true }),
  });

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          <UsersRound className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          Network members
        </h2>
        <Select
          value={roleType}
          onChange={(e) => setRoleType(e.target.value as JoinableRoleType | "all")}
          aria-label="Filter by partner type"
          className="w-auto"
        >
          <option value="all">All partner types</option>
          {JOINABLE_ROLE_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {ROLE_LABELS[rt]}
            </option>
          ))}
        </Select>
      </div>

      <div className="scrollbar-none -mx-1 mt-3 flex gap-1 overflow-x-auto px-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              status === f.key
                ? "bg-primary-600 text-white"
                : "border border-zinc-300 text-zinc-600 hover:border-primary-300 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {isLoading && <Spinner />}
        {isError && <ErrorState message="Couldn't load your network members." />}
        {!isLoading && !isError && (members ?? []).length === 0 && (
          <EmptyState
            icon={UsersRound}
            title={status === "all" && roleType === "all" ? "No one has joined yet" : "No members match these filters"}
            description={
              status === "all" && roleType === "all"
                ? "Share your link with guides and local businesses you trust. They'll appear here as soon as they apply."
                : undefined
            }
          />
        )}
        {(members ?? []).map((m) => (
          <MemberRow key={m.id} member={m} />
        ))}
      </div>
    </Card>
  );
}

function MemberRow({ member: m }: { member: NetworkMember }) {
  const earned = Number(m.earnings_pending) + Number(m.earnings_payable) + Number(m.earnings_paid);
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">{m.member_name}</span>
          <Badge variant="primary">{ROLE_LABELS[m.role_type]}</Badge>
        </div>
        <Badge variant={MEMBER_STATUS_VARIANTS[m.status]}>{MEMBER_STATUS_LABELS[m.status]}</Badge>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Joined {formatDate(m.joined_at)} · {SOURCE_LABELS[m.source]}
        {m.status === "active" && m.commission_expires_at && <> · Earning until {formatDate(m.commission_expires_at)}</>}
        {m.status === "expired" && m.commission_expires_at && <> · Ended {formatDate(m.commission_expires_at)}</>}
        {m.status === "pending" && " · Waiting for Ovigo to approve"}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <span className="text-zinc-500">
          Completed bookings <span className="block font-semibold text-zinc-900 dark:text-zinc-50">{m.completed_bookings}</span>
        </span>
        <span className="text-zinc-500">
          Pending <span className="block font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(m.earnings_pending)}</span>
        </span>
        <span className="text-zinc-500">
          Payable <span className="block font-semibold text-emerald-600">{formatMoney(m.earnings_payable)}</span>
        </span>
        <span className="text-zinc-500">
          Total earned <span className="block font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(earned.toFixed(2))}</span>
        </span>
      </div>
    </div>
  );
}
