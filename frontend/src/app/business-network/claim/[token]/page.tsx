"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { BusinessReferral, ClaimReferralInfo } from "@/types/business-network";

export default function ClaimReferralPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const { data: info, isLoading, isError } = useQuery({
    queryKey: ["business-network", "claim", token],
    queryFn: () => apiClient.get<ClaimReferralInfo>(`/api/v1/business-network/claim/${token}`),
    retry: false,
  });

  const claim = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiClient.post<BusinessReferral>(`/api/v1/business-network/claim/${token}`, undefined, { auth: true });
      setClaimed(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to claim this invite");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Spinner />;
  if (isError || !info) return <ErrorState message="This invite link isn't valid, or has expired." />;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <Card variant="elevated">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">You&apos;ve been invited to Ovigo</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium">{info.referring_expert_name}</span> referred your business,{" "}
          <span className="font-medium">{info.business_name}</span> ({info.business_type}), to join Ovigo.
        </p>
        {info.description && <p className="mt-2 text-sm text-zinc-500">{info.description}</p>}

        {info.already_claimed || claimed ? (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            This invite has been claimed. Apply to become a partner to list your business.
            <Link href="/account/partner" className="mt-2 block font-medium underline">
              Apply as a partner →
            </Link>
          </div>
        ) : !user ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm text-zinc-500">Sign in or create an account to claim this invite.</p>
            <Button onClick={() => router.push(`/account/login?next=/business-network/claim/${token}`)}>Sign in</Button>
            <Button variant="secondary" onClick={() => router.push(`/account/register?next=/business-network/claim/${token}`)}>
              Create an account
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={claim} loading={busy}>
              Claim this invite as {user.full_name}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
