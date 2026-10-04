"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Package, Plus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  Assignment,
  Availability,
  GUIDE_PROFILE_STATUS_LABELS,
  GuideBooking,
  GuidePackage,
  GuideProfile,
  GuideProfileStatus,
  packageDuration,
} from "@/types/guides";

const PROFILE_BADGE: Record<GuideProfileStatus, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  rejected: "danger",
  suspended: "danger",
};

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && days.length < 90) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function Section({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card variant="elevated">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          <span className="text-primary-600 dark:text-primary-400">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** Phase 9.3: what a guide sells directly to travelers — an admin-reviewed public
 * profile, priced packages they change whenever they like, the dates they open for
 * bookings, and the bookings they've received. */
export function GuideServicesPanel({ roleApproved, assignments }: { roleApproved: boolean; assignments: Assignment[] }) {
  return (
    <>
      <ProfileSection roleApproved={roleApproved} />
      <PackagesSection />
      <CalendarSection assignments={assignments} />
      <BookingsSection />
    </>
  );
}

function ProfileSection({ roleApproved }: { roleApproved: boolean }) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["guides", "profile", "mine"],
    queryFn: () => apiClient.get<GuideProfile>("/api/v1/guides/profile/mine", { auth: true }),
    retry: false,
  });

  return (
    <Section
      title="Your public profile"
      icon={<UserRound className="h-4 w-4" />}
      action={
        profile && (
          <Badge variant={PROFILE_BADGE[profile.status]}>{GUIDE_PROFILE_STATUS_LABELS[profile.status]}</Badge>
        )
      }
    >
      {isLoading && <Spinner />}
      {/* Keyed by the last save so the form resets to what the server has. */}
      {profile && <ProfileForm key={profile.updated_at} profile={profile} roleApproved={roleApproved} />}
    </Section>
  );
}

function ProfileForm({ profile, roleApproved }: { profile: GuideProfile; roleApproved: boolean }) {
  const queryClient = useQueryClient();
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [languages, setLanguages] = useState((profile.languages ?? []).join(", "));
  const [years, setYears] = useState(profile.years_experience?.toString() ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const locked = profile.status === "pending_review";
  const canSubmit = profile.status === "draft" || profile.status === "rejected";

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.put(
        "/api/v1/guides/profile/mine",
        {
          headline: headline.trim() || null,
          city: city.trim() || null,
          languages: languages.split(",").map((l) => l.trim()).filter(Boolean),
          years_experience: years === "" ? null : Number(years),
          bio: bio.trim() || null,
        },
        { auth: true }
      );
      setMessage({ ok: true, text: "Saved." });
      queryClient.invalidateQueries({ queryKey: ["guides", "profile", "mine"] });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't save your profile") });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.post("/api/v1/guides/profile/mine/submit", undefined, { auth: true });
      queryClient.invalidateQueries({ queryKey: ["guides", "profile", "mine"] });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't submit your profile") });
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        Travelers find and book you directly from your profile. Ovigo reviews it before it goes live, and keeps a 12%
        commission on each booking.
      </p>
      {profile.status === "published" && (
        <Link
          href={`/guides/${profile.guide_role_id}`}
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          View your public profile <ExternalLink className="h-3 w-3" />
        </Link>
      )}
      {profile.rejection_reason && (profile.status === "rejected" || profile.status === "suspended") && (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {profile.status === "rejected" ? "Ovigo asked for changes: " : "Suspended: "}
          {profile.rejection_reason}
        </p>
      )}
      {locked && <p className="text-xs text-amber-600">Under review — you can edit again once Ovigo has looked at it.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Headline" placeholder="Hill-tracts trekking guide" value={headline} maxLength={255} disabled={locked} onChange={(e) => setHeadline(e.target.value)} />
        <Input label="City" placeholder="Bandarban" value={city} maxLength={120} disabled={locked} onChange={(e) => setCity(e.target.value)} />
        <Input label="Languages" hint="Comma-separated" placeholder="Bangla, English" value={languages} disabled={locked} onChange={(e) => setLanguages(e.target.value)} />
        <Input label="Years guiding" type="number" min={0} max={80} value={years} disabled={locked} onChange={(e) => setYears(e.target.value)} />
      </div>
      <Textarea label="About you" rows={4} maxLength={5000} value={bio} disabled={locked} onChange={(e) => setBio(e.target.value)} />
      {message && <p className={`text-xs ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={save} disabled={busy || locked}>
          Save
        </Button>
        {canSubmit && (
          <Button size="sm" onClick={submit} disabled={busy || !roleApproved}>
            Submit for review
          </Button>
        )}
      </div>
      {canSubmit && !roleApproved && (
        <p className="text-xs text-zinc-400">You can submit once Ovigo has approved your guide role.</p>
      )}
    </div>
  );
}

function PackagesSection() {
  const queryClient = useQueryClient();
  const { data: packages, isLoading } = useQuery({
    queryKey: ["guides", "packages", "mine"],
    queryFn: () => apiClient.get<GuidePackage[]>("/api/v1/guides/packages/mine", { auth: true }),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["guides", "packages", "mine"] });

  return (
    <Section title="Packages & prices" icon={<Package className="h-4 w-4" />}>
      <p className="text-xs text-zinc-500">
        What you offer and what it costs — for example Half day ৳800, Full day ৳1400. Change a price any time: bookings
        already made keep the price they were made at. Experts you work with pick from these when they hire you.
      </p>
      {isLoading && <Spinner />}
      <ul className="mt-3 flex flex-col gap-2">
        {(packages ?? []).map((pkg) => (
          <PackageRow key={`${pkg.id}-${pkg.price}-${pkg.is_active}`} pkg={pkg} onChange={refresh} />
        ))}
        {packages && packages.length === 0 && <p className="text-sm text-zinc-400">No packages yet.</p>}
      </ul>
      <NewPackageForm onCreated={refresh} />
    </Section>
  );
}

function PackageRow({ pkg, onChange }: { pkg: GuidePackage; onChange: () => void }) {
  const [price, setPrice] = useState(pkg.price);
  const [error, setError] = useState<string | null>(null);
  const duration = packageDuration(pkg);

  const update = async (body: Partial<Pick<GuidePackage, "price" | "is_active">>) => {
    setError(null);
    try {
      await apiClient.patch(`/api/v1/guides/packages/${pkg.id}`, body, { auth: true });
      onChange();
    } catch (err) {
      setError(errorText(err, "Couldn't update this package"));
    }
  };

  return (
    <li className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`font-medium ${pkg.is_active ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-400 line-through"}`}>{pkg.name}</p>
          <p className="text-xs text-zinc-500">
            {[duration, pkg.description].filter(Boolean).join(" · ") || "No description"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">৳</span>
          <input
            aria-label={`${pkg.name} price`}
            type="number"
            min={1}
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {Number(price) !== Number(pkg.price) && (
            <Button size="sm" variant="secondary" onClick={() => update({ price })} disabled={!(Number(price) > 0)}>
              Save price
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => update({ is_active: !pkg.is_active })}>
            {pkg.is_active ? "Hide" : "Show"}
          </Button>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

function NewPackageForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [hours, setHours] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(
        "/api/v1/guides/packages",
        {
          name: name.trim(),
          price,
          duration_hours: hours === "" ? null : hours,
          description: description.trim() || null,
        },
        { auth: true }
      );
      setName("");
      setHours("");
      setPrice("");
      setDescription("");
      onCreated();
    } catch (err) {
      setError(errorText(err, "Couldn't add this package"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Add a package</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Name, e.g. Full day" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Hours (optional)" type="number" min={0.5} max={24} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
        <Input placeholder="Price ৳" type="number" min={1} step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="mt-2">
        <Input placeholder="What's included (optional)" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <Button size="sm" className="mt-2" onClick={create} disabled={busy || !name.trim() || !(Number(price) > 0)}>
        <Plus className="h-4 w-4" /> Add package
      </Button>
    </div>
  );
}

function CalendarSection({ assignments }: { assignments: Assignment[] }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const horizon = 60;

  const { data: availability } = useQuery({
    queryKey: ["guides", "availability"],
    queryFn: () =>
      apiClient.get<Availability[]>(`/api/v1/guides/availability?start=${isoDay(0)}&end=${isoDay(horizon)}`, { auth: true }),
    retry: false,
  });
  const { data: bookings } = useQuery({
    queryKey: ["guides", "bookings", "mine"],
    queryFn: () => apiClient.get<GuideBooking[]>("/api/v1/guides/bookings/mine", { auth: true }),
    retry: false,
  });

  const state = new Map((availability ?? []).map((a) => [a.date, a.is_available]));
  const busy = new Set([
    ...(bookings ?? []).filter((b) => b.item_status !== "cancelled" && b.booking_status !== "cancelled").map((b) => b.service_date),
    ...assignments.filter((a) => a.status !== "cancelled").map((a) => a.departure.departure_date),
  ]);

  const setDays = async (dates: string[], isAvailable: boolean) => {
    setError(null);
    try {
      await apiClient.put("/api/v1/guides/availability", { dates, is_available: isAvailable }, { auth: true });
      queryClient.invalidateQueries({ queryKey: ["guides", "availability"] });
    } catch (err) {
      setError(errorText(err, "Couldn't update your calendar"));
    }
  };

  const range = from && to && from <= to ? daysBetween(from, to) : [];

  return (
    <Section title="Calendar" icon={<CalendarDays className="h-4 w-4" />}>
      <p className="text-xs text-zinc-500">
        Travelers can book you only on days you open. Experts can assign you any day you haven&apos;t blocked. Tap a day to
        switch it between open and blocked.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input label="From" type="date" min={isoDay(0)} value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" min={from || isoDay(0)} value={to} onChange={(e) => setTo(e.target.value)} />
        <Button size="sm" onClick={() => setDays(range, true)} disabled={range.length === 0}>
          Open for bookings
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDays(range, false)} disabled={range.length === 0}>
          Block
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {daysBetween(isoDay(0), isoDay(horizon - 1)).map((day) => {
          const taken = busy.has(day);
          const open = state.get(day);
          const style = taken
            ? "border-primary-300 bg-primary-100 text-primary-800 dark:border-primary-800 dark:bg-primary-950 dark:text-primary-200"
            : open === true
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : open === false
                ? "border-red-200 bg-red-50 text-red-700 line-through dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                : "border-zinc-200 text-zinc-500 dark:border-zinc-800";
          return (
            <button
              key={day}
              type="button"
              disabled={taken}
              title={taken ? "Booked" : open === true ? "Open — tap to block" : open === false ? "Blocked — tap to open" : "Not open — tap to open"}
              onClick={() => setDays([day], open !== true)}
              className={`rounded-lg border px-1 py-1.5 text-center text-[11px] leading-tight transition-colors disabled:cursor-default ${style}`}
            >
              <span className="block font-semibold">{Number(day.slice(8))}</span>
              <span className="block opacity-70">{new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-300" /> Open</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-200" /> Blocked</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary-300" /> Booked</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-zinc-300" /> Not open</span>
      </div>
    </Section>
  );
}

function BookingsSection() {
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["guides", "bookings", "mine"],
    queryFn: () => apiClient.get<GuideBooking[]>("/api/v1/guides/bookings/mine", { auth: true }),
    retry: false,
  });

  return (
    <Section title="Traveler bookings" icon={<Users className="h-4 w-4" />}>
      {isLoading && <Spinner />}
      <ul className="flex flex-col gap-2">
        {(bookings ?? []).map((b) => (
          <li
            key={b.item_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {b.service_date} · {b.package_name}
              </p>
              <p className="text-xs text-zinc-500">
                {b.traveler_name}
                {b.traveler_email && ` · ${b.traveler_email}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{formatMoney(b.price)}</span>
              <Badge variant={b.booking_status === "cancelled" ? "danger" : b.booking_status === "completed" ? "success" : "primary"} className="capitalize">
                {b.booking_status.replace("_", " ")}
              </Badge>
            </div>
          </li>
        ))}
        {bookings && bookings.length === 0 && (
          <p className="text-sm text-zinc-400">No traveler bookings yet — open some days and publish your profile.</p>
        )}
      </ul>
    </Section>
  );
}
