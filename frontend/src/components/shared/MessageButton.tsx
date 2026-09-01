"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/Button";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { ChatContextType, ChatThread } from "@/types/chat";

export function MessageButton({
  contextType,
  contextId,
  label = "Message",
  variant = "secondary",
  size = "sm",
}: {
  contextType: ChatContextType;
  contextId: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
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
      <Button onClick={openThread} loading={busy} variant={variant} size={size}>
        <MessageCircle className="h-4 w-4" />
        {busy ? "Opening…" : label}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
