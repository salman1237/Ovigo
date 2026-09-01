"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, MessageSquare, Paperclip } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { ChatThread } from "@/types/chat";

export default function ChatInboxPage() {
  const user = useAuthStore((s) => s.user);

  const { data: threads, isLoading, isError } = useQuery({
    queryKey: ["chat", "threads"],
    queryFn: () => apiClient.get<ChatThread[]>("/api/v1/chat/threads", { auth: true }),
    enabled: !!user,
    refetchInterval: 15_000,
  });

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <p className="text-sm text-zinc-500">
          <a href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in
          </a>{" "}
          to view your messages.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Messages</h1>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="Couldn't load your conversations. Please try again." />}
      {!isLoading && !isError && (threads ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            description="Message a partner from a tour, stay or vehicle page to get started."
          />
        </div>
      )}

      <div className="mt-6 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
        {(threads ?? []).map((t) => (
          <Link
            key={t.id}
            href={`/chat/${t.id}`}
            className="flex items-start gap-3 rounded-lg px-2 py-4 hover:bg-primary-50/60 dark:hover:bg-primary-950/20"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-sm font-semibold text-white">
              {t.other_party.full_name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                  {t.other_party.full_name}
                  {t.status === "closed" && <span className="ml-2 text-xs font-normal text-zinc-400">(closed)</span>}
                </p>
                {t.unread_count > 0 && (
                  <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                    {t.unread_count}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-zinc-500">{t.context_title}</p>
              {t.last_message && (
                <p className="mt-1 flex items-center gap-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {t.last_message.message_type === "text" && t.last_message.body}
                  {t.last_message.message_type === "location" && (
                    <>
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> Shared a location
                    </>
                  )}
                  {t.last_message.message_type === "attachment" && (
                    <>
                      <Paperclip className="h-3.5 w-3.5 shrink-0" /> Sent an attachment
                    </>
                  )}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
