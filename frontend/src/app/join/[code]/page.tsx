"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BadgeCheck, Building2, Car, Compass, Home, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { API_URL } from "@/lib/constants";
import { saveReferralCode } from "@/lib/referral";
import { useAuthStore } from "@/stores/auth-store";
import { JOINABLE_ROLE_TYPES, type JoinableRoleType, type PublicReferralLink } from "@/types/referrals";

const ROLE_OPTIONS: Record<JoinableRoleType, { label: string; description: string; icon: typeof Compass }> = {
  guide: { label: "Guide", description: "Lead tours and experiences alongside a Local Expert.", icon: Compass },
  host: { label: "Homestay / Host", description: "List your home, guesthouse or homestay.", icon: Home },
  hotel: { label: "Hotel / Resort", description: "List rooms at your hotel or resort.", icon: Building2 },
  rent_a_car: { label: "Rent-a-Car", description: "Rent out vehicles and take ride requests.", icon: Car },
};

export default function JoinPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <JoinContent />
    </Suspense>
  );
}

function JoinContent() {
  const { code } = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const preset = searchParams.get("role") as JoinableRoleType | null;
  const [role, setRole] = useState<JoinableRoleType>(
    preset && JOINABLE_ROLE_TYPES.includes(preset) ? preset : "host"
  );

  const { data: link, isLoading, isError } = useQuery({
    queryKey: ["referral-link", code],
    queryFn: () =>
      apiClient.get<PublicReferralLink>(`/api/v1/referrals/links/${encodeURIComponent(code)}?count_visit=true`),
    retry: false,
    staleTime: Infinity,
  });

  // Remember the code for the register → apply steps that follow, which may be on
  // a later visit. Keyed on the server's canonical (normalized) code.
  useEffect(() => {
    if (link) saveReferralCode(link.code);
  }, [link]);

  const applyPath = `/account/partner?role=${role}`;
  const continueToApply = () => {
    if (user) router.push(applyPath);
    else router.push(`/account/register?next=${encodeURIComponent(applyPath)}`);
  };

  if (isLoading) return <Spinner />;

  if (isError || !link) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-16 sm:px-6">
        <Card variant="elevated" className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">This invite link isn&apos;t active</h1>
          <p className="mt-2 text-sm text-zinc-500">
            The link may have been replaced by a newer one. You can still join Ovigo as a partner directly.
          </p>
          <Link href="/account/partner" className="mt-4 inline-block font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Become a partner →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card variant="elevated" className="p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            You&apos;re invited to Ovigo
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-primary-500/30 bg-primary-100 dark:bg-zinc-800">
              {link.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${API_URL}${link.photo_url}`} alt={link.expert_name} className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-8 w-8 text-primary-500" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="flex items-center gap-1.5 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {link.expert_name}
                <BadgeCheck className="h-5 w-5 shrink-0 text-primary-500" aria-label="Verified Local Expert" />
              </h1>
              <p className="text-sm text-zinc-500">
                {link.headline || "Verified Local Expert on Ovigo"}
              </p>
              {(link.primary_destination || link.years_experience) && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                  {link.primary_destination && (
                    <>
                      <MapPin className="h-3.5 w-3.5" />
                      {link.primary_destination}
                    </>
                  )}
                  {link.primary_destination && link.years_experience ? " · " : ""}
                  {link.years_experience ? `${link.years_experience} yrs experience` : ""}
                </p>
              )}
            </div>
          </div>

          <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-400">
            {link.expert_name} invited you to join their network on Ovigo. List your service, get verified by our
            team, and start taking bookings from travelers.
          </p>

          <h2 className="mt-6 text-sm font-semibold text-zinc-700 dark:text-zinc-300">How do you want to join?</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Partner type">
            {link.allowed_role_types.map((rt) => {
              const option = ROLE_OPTIONS[rt];
              const Icon = option.icon;
              const selected = role === rt;
              return (
                <button
                  key={rt}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRole(rt)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-primary-500 bg-primary-50 dark:border-primary-600 dark:bg-primary-950/40"
                      : "border-zinc-200 hover:border-primary-300 dark:border-zinc-800 dark:hover:border-primary-800"
                  )}
                >
                  <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", selected ? "text-primary-600" : "text-zinc-400")} />
                  <span>
                    <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">{option.label}</span>
                    <span className="block text-xs text-zinc-500">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <Button onClick={continueToApply} className="mt-6 w-full">
            {user ? `Continue as ${user.full_name}` : "Create an account to continue"}
          </Button>
          {!user && (
            <p className="mt-3 text-center text-sm text-zinc-500">
              Already on Ovigo?{" "}
              <Link
                href={`/account/login?next=${encodeURIComponent(applyPath)}`}
                className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Sign in
              </Link>
            </p>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
