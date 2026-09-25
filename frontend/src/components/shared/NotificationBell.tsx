"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { getExistingSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { Notification } from "@/types/notification";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription().then((sub) => setPushEnabled(!!sub));
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        await subscribeToPush();
        setPushEnabled(true);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Failed to update push notifications");
    } finally {
      setPushBusy(false);
    }
  };

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => apiClient.get<{ count: number }>("/api/v1/notifications/unread-count", { auth: true }),
    refetchInterval: 30_000,
  });

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => apiClient.get<Notification[]>("/api/v1/notifications", { auth: true }),
    enabled: open,
  });

  const count = unread?.count ?? 0;

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = async (id: string) => {
    await apiClient.post(`/api/v1/notifications/${id}/read`, undefined, { auth: true });
    refetchAll();
  };

  const markAllRead = async () => {
    await apiClient.post("/api/v1/notifications/read-all", undefined, { auth: true });
    refetchAll();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative rounded-full p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notifications</span>
              <div className="flex items-center gap-3">
                {isPushSupported() && (
                  <button
                    onClick={togglePush}
                    disabled={pushBusy}
                    title={pushEnabled ? "Disable browser push notifications" : "Enable browser push notifications"}
                    className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    {pushEnabled ? <BellRing className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" /> : <Bell className="h-3.5 w-3.5" />}
                    {pushEnabled ? "Push on" : "Enable push"}
                  </button>
                )}
                {count > 0 && (
                  <button onClick={markAllRead} className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
                    Mark all read
                  </button>
                )}
              </div>
            </div>
            {pushError && <p className="border-b border-zinc-100 px-4 py-2 text-xs text-red-600 dark:border-zinc-800">{pushError}</p>}
            <div className="max-h-96 overflow-y-auto">
              {isLoading && <p className="px-4 py-6 text-center text-sm text-zinc-400">Loading…</p>}
              {!isLoading && (notifications ?? []).length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-zinc-400">No notifications yet.</p>
              )}
              {(notifications ?? []).map((n) => {
                const rowClass = cn(
                  "block border-b border-zinc-100 px-4 py-3 text-sm text-left last:border-b-0 dark:border-zinc-900",
                  !n.is_read && "bg-primary-50/60 dark:bg-primary-950/20"
                );
                const content = (
                  <>
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">{n.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{n.message}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">{new Date(n.created_at).toLocaleString()}</p>
                  </>
                );
                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => {
                      setOpen(false);
                      if (!n.is_read) markRead(n.id);
                    }}
                    className={rowClass}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    onClick={() => !n.is_read && markRead(n.id)}
                    disabled={n.is_read}
                    className={cn(rowClass, "w-full disabled:cursor-default")}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
