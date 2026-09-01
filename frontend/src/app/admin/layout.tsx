"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuthStore } from "@/stores/auth-store";

const NAV = [
  { href: "/admin/partners", label: "Partner Approvals" },
  { href: "/admin/tours", label: "Tour Approvals" },
  { href: "/admin/properties", label: "Property Approvals" },
  { href: "/admin/locations", label: "Locations" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/business-network", label: "Business Referrals" },
  { href: "/admin/commission-rules", label: "Commission Rules" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/badges", label: "Trust Badges" },
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
          <Link href="/account/login" className="mt-2 inline-block font-medium text-zinc-900 dark:text-zinc-50">
            Sign in as an admin →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <nav className="flex shrink-0 gap-2 border-b border-zinc-200 px-6 py-3 md:w-56 md:flex-col md:border-b-0 md:border-r md:py-6 dark:border-zinc-800">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === item.href
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
