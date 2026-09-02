"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";

const NAV = [
  { href: "/admin/partners", label: "Partner Approvals" },
  { href: "/admin/tours", label: "Tour Approvals" },
  { href: "/admin/properties", label: "Property Approvals" },
  { href: "/admin/vehicles", label: "Vehicle Approvals" },
  { href: "/admin/locations", label: "Locations" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/business-network", label: "Business Referrals" },
  { href: "/admin/chat", label: "Chat Moderation" },
  { href: "/admin/commission-rules", label: "Commission Rules" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/badges", label: "Trust Badges" },
  { href: "/admin/ads", label: "Ad Campaigns" },
  { href: "/admin/fraud", label: "Fraud & Risk" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();

  // Client-side gate for UX only — every admin endpoint enforces its own RBAC check
  // server-side (require_admin), so this is not the real security boundary.
  if (!user || (user.system_role !== "admin" && user.system_role !== "super_admin")) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600 dark:text-zinc-400">This area is for admins only.</p>
          <Link href="/account/login" className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in as an admin →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-zinc-200 px-6 py-3 md:w-60 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:py-6 dark:border-zinc-800">
        <div className="mb-2 hidden items-center gap-2 px-3 text-sm font-semibold text-zinc-900 md:flex dark:text-zinc-50">
          <ShieldCheck className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          Admin
        </div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
