"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { ChatContextType, ChatThread } from "@/types/chat";

export function MessageButton({
  contextType,
  contextId,
  label = "Message",
  className,
}: {
  contextType: ChatContextType;
  contextId: string;
  label?: string;
  className?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const openThread = async () => {
    setBusy(true);
    setError(null);
    try {
      const thread = await apiClient.post<ChatThread>(
        "/api/v1/chat/threads",
        { context_type: contextType, context_id: contextId },
        { auth: true }
      );
      router.push(`/chat/${thread.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open conversation");
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={openThread}
        disabled={busy}
        className={
          className ??
          "rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
        }
      >
        {busy ? "Opening…" : label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
