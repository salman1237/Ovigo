"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Briefcase,
  Building2,
  Car,
  ChevronDown,
  ClipboardList,
  Coins,
  Compass,
  Handshake,
  LayoutDashboard,
  LogOut,
  Map,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  User as UserIcon,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { useMyApprovedRoleTypes } from "@/hooks/useMyPartnerRoles";
import { cn } from "@/lib/cn";
import type { PartnerRoleType } from "@/types/partner";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: PartnerRoleType[];
}

const EXPLORE_LINKS: NavItem[] = [
  { href: "/tours", label: "Tours", icon: Map },
  { href: "/stays", label: "Stays", icon: Compass },
  { href: "/rent-a-car", label: "Rent a Car", icon: Car },
  { href: "/esim", label: "eSIM", icon: Smartphone },
];

const TRAVELER_LINKS: NavItem[] = [
  { href: "/bookings", label: "My Bookings", icon: ClipboardList },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/chat", label: "Messages", icon: MessageCircle },
  { href: "/custom-requests", label: "Custom Trip", icon: Sparkles },
  { href: "/esim/orders", label: "My eSIMs", icon: Smartphone },
];

// `roles` mirrors each page's own backend permission dependency — see the
// matching comment in Header.tsx's own PARTNER_LINKS.
const PARTNER_LINKS: NavItem[] = [
  { href: "/dashboard/tours", label: "My Tours", icon: Map, roles: ["local_expert"] },
  { href: "/dashboard/properties", label: "My Properties", icon: Building2, roles: ["host", "hotel"] },
  { href: "/dashboard/vehicles", label: "My Vehicles", icon: Car, roles: ["rent_a_car"] },
  { href: "/dashboard/drivers", label: "My Drivers", icon: UserIcon, roles: ["rent_a_car"] },
  { href: "/dashboard/bids", label: "Bid Requests", icon: Handshake, roles: ["local_expert"] },
  { href: "/dashboard/guides", label: "My Guides", icon: Users, roles: ["local_expert"] },
  { href: "/dashboard/guide", label: "Guide Dashboard", icon: Compass, roles: ["guide"] },
  { href: "/dashboard/business-network", label: "Business Network", icon: Briefcase, roles: ["local_expert"] },
  { href: "/dashboard/ads", label: "Ad Campaigns", icon: Megaphone, roles: ["local_expert", "host", "hotel", "rent_a_car"] },
  { href: "/dashboard/earnings", label: "Earnings", icon: Coins, roles: ["local_expert", "host", "hotel", "guide"] },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, roles: ["local_expert", "host", "hotel", "rent_a_car"] },
  { href: "/dashboard/staff", label: "Staff Invitations", icon: UserPlus, roles: ["host", "hotel"] },
];

export function MobileMenu({
  open,
  onClose,
  isLoggedIn,
  isAdmin,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const approvedRoleTypes = useMyApprovedRoleTypes();
  const myPartnerLinks = PARTNER_LINKS.filter((item) => item.roles?.some((r) => approvedRoleTypes.has(r)));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col overflow-y-auto bg-white p-5 shadow-2xl dark:bg-zinc-950 lg:hidden"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-heading bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
                Ovigo
              </span>
              <button
                onClick={onClose}
                aria-label="Close menu"
                className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-4 flex flex-1 flex-col gap-3">
              <SectionCard title="Explore" icon={Compass} tone="primary">
                {EXPLORE_LINKS.map((item) => (
                  <MobileLink key={item.href} {...item} active={pathname?.startsWith(item.href)} onClose={onClose} />
                ))}
              </SectionCard>

              {isLoggedIn && (
                <>
                  <SectionCard title="Traveler" icon={Briefcase} tone="accent">
                    {TRAVELER_LINKS.map((item) => (
                      <MobileLink key={item.href} {...item} active={pathname?.startsWith(item.href)} onClose={onClose} />
                    ))}
                  </SectionCard>

                  {myPartnerLinks.length > 0 && (
                    <AccordionSection title="Partner Tools" icon={LayoutDashboard} tone="primary" count={myPartnerLinks.length}>
                      {myPartnerLinks.map((item) => (
                        <MobileLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname?.startsWith(item.href)} onClose={onClose} />
                      ))}
                    </AccordionSection>
                  )}

                  <SectionCard title="Account" icon={ShieldCheck} tone="accent">
                    <MobileLink href="/dashboard/profile" label="My Profile" icon={UserIcon} active={pathname?.startsWith("/dashboard/profile")} onClose={onClose} />
                    <MobileLink href="/account/partner" label="Become a Partner" icon={Briefcase} active={pathname?.startsWith("/account/partner")} onClose={onClose} />
                    {isAdmin && <MobileLink href="/admin/partners" label="Admin" icon={ShieldCheck} active={pathname?.startsWith("/admin")} onClose={onClose} />}
                  </SectionCard>
                </>
              )}
            </nav>

            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-900">
              {isLoggedIn ? (
                <button
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <MobileLink href="/account/login" label="Sign in" icon={UserIcon} onClose={onClose} />
                  <Link
                    href="/account/register"
                    onClick={onClose}
                    className="rounded-full bg-gradient-to-r from-primary-600 to-indigo-600 px-4 py-2.5 text-center text-sm font-medium text-white shadow-md shadow-primary-600/20"
                  >
                    Create account
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const TONE_CHIP = {
  primary: "bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300",
  accent: "bg-accent-100 text-accent-700 dark:bg-accent-950/60 dark:text-accent-300",
};

function SectionCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: "primary" | "accent";
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-2 dark:bg-zinc-900/60">
      <p className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", TONE_CHIP[tone])}>
          <Icon className="h-3 w-3" />
        </span>
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** Collapsed by default — the Partner Tools list alone is 12 links, more than
 * every other section combined, so it stays tucked away for the travelers who
 * make up most visits instead of dominating the drawer on open. */
function AccordionSection({
  title,
  icon: Icon,
  tone,
  count,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: "primary" | "accent";
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-zinc-50 p-2 dark:bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2 py-1"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", TONE_CHIP[tone])}>
            <Icon className="h-3 w-3" />
          </span>
          {title}
        </span>
        <span className="flex items-center gap-1 text-zinc-400">
          {!open && <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium dark:bg-zinc-800">{count}</span>}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileLink({
  href,
  label,
  icon: Icon,
  active,
  onClose,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-white text-primary-700 shadow-sm dark:bg-zinc-800 dark:text-primary-300"
          : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-50"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}
