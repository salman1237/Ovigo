"use client";

import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { PartnerRole, PartnerRoleType } from "@/types/partner";

interface NavItem {
  href: string;
  label: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const ROLE_SECTIONS: Record<PartnerRoleType, NavSection> = {
  local_expert: {
    title: "Local Expert",
    items: [{ href: "/dashboard/tours", label: "Tours" }],
  },
  guide: {
    title: "Guide",
    items: [{ href: "/dashboard/guide", label: "My Profile & Packages" }],
  },
  host: {
    title: "Host",
    items: [{ href: "/dashboard/properties", label: "Properties" }],
  },
  hotel: {
    title: "Hotel / Resort",
    items: [{ href: "/dashboard/properties", label: "Properties" }],
  },
  rent_a_car: {
    title: "Rent-a-Car",
    items: [
      { href: "/dashboard/vehicles", label: "Vehicles" },
      { href: "/dashboard/drivers", label: "Drivers" },
      { href: "/dashboard/ride-bids", label: "Ride Bids" },
    ],
  },
};

const SHARED_ITEMS: NavItem[] = [
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/earnings", label: "Earnings" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/business-network", label: "Business Network" },
  { href: "/dashboard/network", label: "Expert Network" },
  { href: "/dashboard/ads", label: "Ad Campaigns" },
  { href: "/dashboard/bids", label: "Custom Trip Bids" },
  { href: "/dashboard/staff", label: "Staff" },
];

// Fixed priority order — determines both the dashboard index page's default redirect
// and the order role sections appear in the sidebar when a user holds several roles.
export const ROLE_PRIORITY: PartnerRoleType[] = ["local_expert", "guide", "host", "hotel", "rent_a_car"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();

  const { data: roles, isLoading } = useQuery({
    queryKey: ["my-partner-roles"],
    queryFn: () => apiClient.get<PartnerRole[]>("/api/v1/partners/roles", { auth: true }),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600">This area is for signed-in partners.</p>
          <Link href="/account/login" className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700">
            Sign in →
          </Link>
        </div>
      </div>
    );
  }

  const approvedRoleTypes = ROLE_PRIORITY.filter((rt) =>
    (roles ?? []).some((r) => r.role_type === rt && r.status === "approved")
  );

  if (!isLoading && approvedRoleTypes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600">You don&apos;t have an approved partner role yet.</p>
          <Link href="/account/partner" className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700">
            Apply to become a partner →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-zinc-200 px-6 py-3 md:sticky md:top-0 md:h-screen md:w-64 md:flex-col md:gap-4 md:overflow-y-auto md:overflow-x-visible md:border-b-0 md:border-r md:py-6">
        <div className="mb-2 hidden items-center gap-2 px-3 text-sm font-semibold text-zinc-900 md:flex">
          <LayoutDashboard className="h-4 w-4 text-primary-600" />
          Dashboard
        </div>

        {approvedRoleTypes.map((roleType) => {
          const section = ROLE_SECTIONS[roleType];
          return (
            <div key={roleType} className="flex shrink-0 flex-col gap-1 md:shrink">
              <span className="hidden px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 md:block">
                {section.title}
              </span>
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} active={pathname === item.href} />
              ))}
            </div>
          );
        })}

        <div className="flex shrink-0 flex-col gap-1 md:mt-2 md:shrink md:border-t md:border-zinc-200 md:pt-4">
          {SHARED_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </div>
      </nav>
      <div className="flex-1 px-6 py-8">{children}</div>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
          : "text-zinc-600 hover:bg-zinc-100"
      )}
    >
      {item.label}
    </Link>
  );
}
