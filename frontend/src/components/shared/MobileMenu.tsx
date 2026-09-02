"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Briefcase,
  Compass,
  LogOut,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

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
  const traveler: NavItem[] = [
    { href: "/bookings", label: "My Bookings" },
    { href: "/cart", label: "Cart" },
    { href: "/chat", label: "Messages" },
    { href: "/custom-requests", label: "Custom Trip" },
  ];

  const partner: NavItem[] = [
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
    { href: "/dashboard/staff", label: "Staff Invitations" },
  ];

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
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col overflow-y-auto bg-white p-6 shadow-2xl dark:bg-zinc-950 lg:hidden"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="flex items-center justify-between">
              <span className="bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
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

            <nav className="mt-6 flex flex-1 flex-col gap-6">
              <Section title="Explore" icon={Compass}>
                <MobileLink href="/tours" label="Tours" onClose={onClose} />
                <MobileLink href="/stays" label="Stays" onClose={onClose} />
                <MobileLink href="/rent-a-car" label="Rent a Car" onClose={onClose} />
              </Section>

              {isLoggedIn && (
                <>
                  <Section title="Traveler" icon={Briefcase}>
                    {traveler.map((item) => (
                      <MobileLink key={item.href} href={item.href} label={item.label} onClose={onClose} />
                    ))}
                  </Section>

                  <Section title="Partner Tools" icon={Briefcase}>
                    {partner.map((item) => (
                      <MobileLink key={item.href} href={item.href} label={item.label} onClose={onClose} />
                    ))}
                  </Section>

                  <Section title="Account" icon={ShieldCheck}>
                    <MobileLink href="/dashboard/profile" label="My Profile" onClose={onClose} />
                    <MobileLink href="/account/partner" label="Become a Partner" onClose={onClose} />
                    {isAdmin && <MobileLink href="/admin/partners" label="Admin" onClose={onClose} />}
                  </Section>
                </>
              )}
            </nav>

            <div className="mt-auto border-t border-zinc-100 pt-4 dark:border-zinc-900">
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
                  <MobileLink href="/account/login" label="Sign in" onClose={onClose} />
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

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      <div className="mt-1 flex flex-col">{children}</div>
    </div>
  );
}

function MobileLink({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="rounded-lg px-3 py-2.5 text-sm text-zinc-700 hover:bg-primary-50 hover:text-primary-700 dark:text-zinc-300 dark:hover:bg-primary-950/40 dark:hover:text-primary-300"
    >
      {label}
    </Link>
  );
}
