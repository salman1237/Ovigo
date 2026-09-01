"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Car,
  ChevronDown,
  Compass,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { NotificationBell } from "@/components/shared/NotificationBell";
import { MobileMenu } from "@/components/shared/MobileMenu";
import { Popover } from "@/components/ui/Popover";
import { buttonVariants } from "@/components/ui/Button";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import type { ChatThread } from "@/types/chat";

const PRIMARY_NAV = [
  { href: "/tours", label: "Tours", icon: Map },
  { href: "/stays", label: "Stays", icon: Compass },
  { href: "/rent-a-car", label: "Rent a Car", icon: Car },
];

const PARTNER_LINKS = [
  { href: "/dashboard/tours", label: "My Tours" },
  { href: "/dashboard/properties", label: "My Properties" },
  { href: "/dashboard/vehicles", label: "My Vehicles" },
  { href: "/dashboard/drivers", label: "My Drivers" },
  { href: "/dashboard/bids", label: "Bid Requests" },
  { href: "/dashboard/guides", label: "My Guides" },
  { href: "/dashboard/guide", label: "Guide Dashboard" },
  { href: "/dashboard/business-network", label: "Business Network" },
  { href: "/dashboard/ads", label: "Ad Campaigns" },
  { href: "/dashboard/earnings", label: "Earnings" },
  { href: "/dashboard/analytics", label: "Analytics" },
];

const TRAVELER_LINKS = [
  { href: "/bookings", label: "My Bookings" },
  { href: "/custom-requests", label: "Custom Trip" },
];

export function Header() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const cartCount = useCartStore((s) => s.items.length);
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
    <>
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-md shadow-primary-600/30">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
              Ovigo
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname?.startsWith(item.href)}
              />
            ))}

            {user && (
              <Popover
                align="left"
                trigger={({ toggle, open }) => (
                  <button
                    onClick={toggle}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
                      open && "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
                    )}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                )}
              >
                <DropdownSectionLabel>Traveler</DropdownSectionLabel>
                {TRAVELER_LINKS.map((item) => (
                  <DropdownLink key={item.href} href={item.href} label={item.label} />
                ))}
                <DropdownSectionLabel>Partner Tools</DropdownSectionLabel>
                {PARTNER_LINKS.map((item) => (
                  <DropdownLink key={item.href} href={item.href} label={item.label} />
                ))}
              </Popover>
            )}
          </nav>

          <div className="flex items-center gap-1">
            {user ? (
              <>
                <IconLink href="/cart" label="Cart" icon={ShoppingCart} count={cartCount} className="hidden sm:inline-flex" />
                <IconLink href="/chat" label="Messages" icon={MessageCircle} count={unreadChatCount} className="hidden sm:inline-flex" />
                <NotificationBell />

                <Popover
                  trigger={({ toggle, open }) => (
                    <button
                      onClick={toggle}
                      className={cn(
                        "ml-1 flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900",
                        open && "bg-zinc-100 dark:bg-zinc-900"
                      )}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-xs font-semibold text-white">
                        {user.full_name.charAt(0).toUpperCase()}
                      </span>
                      <span className="hidden max-w-24 truncate md:inline">{user.full_name}</span>
                      <ChevronDown className="hidden h-3.5 w-3.5 md:inline" />
                    </button>
                  )}
                >
                  <DropdownLink href="/dashboard/profile" label="My Profile" icon={UserIcon} />
                  <DropdownLink href="/account/partner" label="Become a Partner" icon={Briefcase} />
                  {isAdmin && <DropdownLink href="/admin/partners" label="Admin" icon={ShieldCheck} />}
                  <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </Popover>
              </>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Link href="/account/login" className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                  Sign in
                </Link>
                <Link href="/account/register" className={buttonVariants({ size: "sm" })}>
                  Create account
                </Link>
              </div>
            )}

            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="ml-1 rounded-full p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        isLoggedIn={!!user}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      />
    </>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon?: LucideIcon;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </Link>
  );
}

function IconLink({
  href,
  label,
  icon: Icon,
  count,
  className,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  count: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn("relative rounded-full p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900", className)}
    >
      <Icon className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

function DropdownSectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{children}</p>;
}

function DropdownLink({ href, label, icon: Icon }: { href: string; label: string; icon?: LucideIcon }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-primary-50 hover:text-primary-700 dark:text-zinc-300 dark:hover:bg-primary-950/40 dark:hover:text-primary-300"
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </Link>
  );
}
