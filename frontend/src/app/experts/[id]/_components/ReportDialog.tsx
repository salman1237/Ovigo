"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

/** PRD §8.2 "Report-profile button": the report goes to Ovigo's admins. */
export function ReportDialog({ expertRoleId, onClose }: { expertRoleId: string; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setError(null);
    if (reason.trim().length < 10) {
      setError("Please describe the problem in at least 10 characters.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/partners/profiles/expert/${expertRoleId}/report`, { reason: reason.trim() }, { auth: true });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="report-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          Report this profile
        </h2>
        <p className="mt-1 text-sm text-zinc-500">Tell Ovigo&apos;s trust & safety team what&apos;s wrong — a misleading listing, unsafe practice or anything else.</p>
        {sent ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            Thanks — your report has been sent to Ovigo&apos;s team.
          </div>
        ) : !user ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href={`/account/login?next=${encodeURIComponent(pathname)}`} className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
              Sign in
            </Link>{" "}
            to report a profile.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the problem…" aria-label="Reason for the report" />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {sent ? "Close" : "Cancel"}
          </Button>
          {user && !sent && (
            <Button variant="destructive" size="sm" onClick={submit} loading={busy}>
              Send report
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
