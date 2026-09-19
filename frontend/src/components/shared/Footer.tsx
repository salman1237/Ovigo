import { CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";

const EXPLORE_LINKS = [
  { href: "/tours", label: "Tours" },
  { href: "/stays", label: "Stays" },
  { href: "/rent-a-car", label: "Rent a Car" },
  { href: "/esim", label: "eSIM" },
];

const ACCOUNT_LINKS = [
  { href: "/account/partner", label: "Become a Partner" },
  { href: "/bookings", label: "My Bookings" },
  { href: "/account/loyalty", label: "Loyalty Rewards" },
  { href: "/custom-requests", label: "Custom Trip Request" },
];

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <span className="font-heading bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
            Ovigo
          </span>
          <p className="mt-2 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            Local experts, hosts &amp; rentals — one marketplace. Every listing is admin-verified before it
            reaches you.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Explore</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {EXPLORE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-zinc-500 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-primary-400">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Your account</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-zinc-500 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-primary-400">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Secure payments</h3>
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <CreditCard className="h-4 w-4 shrink-0" />
            Cards, mobile banking &amp; bank transfer
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            Checkout secured via SSLCommerz
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100 px-6 py-5 dark:border-zinc-900">
        <p className="mx-auto max-w-7xl text-xs text-zinc-400">
          © {new Date().getFullYear()} Ovigo. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
