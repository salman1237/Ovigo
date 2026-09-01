"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { NotificationBell } from "@/components/shared/NotificationBell";
import type { ChatThread } from "@/types/chat";

export function Header() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const cartCount = useCartStore((s) => s.items.length);
  const router = useRouter();

  const { data: chatThreads } = useQuery({
    queryKey: ["chat", "threads"],
    queryFn: () => apiClient.get<ChatThread[]>("/api/v1/chat/threads", { auth: true }),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const unreadChatCount = (chatThreads ?? []).reduce((sum, t) => sum + t.unread_count, 0);

  const isAdmin = user?.system_role === "admin" || user?.system_role === "super_admin";

  const handleLogout = async () => {
    try {
      await apiClient.post("/api/v1/auth/logout", undefined, { auth: true });
    } catch {
      // stateless JWTs — logout endpoint has nothing to invalidate server-side yet
    }
    clearSession();
    router.push("/");
  };

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <Link href="/" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Ovigo
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/tours" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
          Tours
        </Link>
        <Link href="/stays" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
          Stays
        </Link>
        <Link href="/rent-a-car" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
          Rent a Car
        </Link>
        {user ? (
          <>
            <Link href="/bookings" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              My Bookings
            </Link>
            <Link href="/cart" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Cart{cartCount > 0 && ` (${cartCount})`}
            </Link>
            <Link href="/chat" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Messages{unreadChatCount > 0 && ` (${unreadChatCount})`}
            </Link>
            <Link href="/custom-requests" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Custom Trip
            </Link>
            <Link href="/dashboard/tours" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              My Tours
            </Link>
            <Link href="/dashboard/properties" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              My Properties
            </Link>
            <Link href="/dashboard/vehicles" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              My Vehicles
            </Link>
            <Link href="/dashboard/drivers" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              My Drivers
            </Link>
            <Link href="/dashboard/bids" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Bid Requests
            </Link>
            <Link href="/dashboard/guides" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              My Guides
            </Link>
            <Link href="/dashboard/guide" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Guide Dashboard
            </Link>
            <Link href="/dashboard/business-network" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Business Network
            </Link>
            <Link href="/dashboard/earnings" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Earnings
            </Link>
            <Link href="/dashboard/analytics" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Analytics
            </Link>
            <Link href="/dashboard/profile" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              My Profile
            </Link>
            <Link href="/account/partner" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Become a Partner
            </Link>
            {isAdmin && (
              <Link href="/admin/partners" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                Admin
              </Link>
            )}
            <NotificationBell />
            <span className="text-zinc-400">{user.full_name}</span>
            <button onClick={handleLogout} className="font-medium text-zinc-900 dark:text-zinc-50">
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/account/login" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Sign in
            </Link>
            <Link href="/account/register" className="font-medium text-zinc-900 dark:text-zinc-50">
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
