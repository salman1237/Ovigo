"use client";

import { motion } from "framer-motion";
import { Building2, Car, Map, UserCheck } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";

const FEATURES = [
  {
    icon: Map,
    title: "Tours",
    description: "Fixed-date tours led by verified local experts, with full itineraries and transparent pricing.",
    href: "/tours",
  },
  {
    icon: Building2,
    title: "Stays",
    description: "Book rooms directly from hosts and hotels, with real-time availability and instant confirmation.",
    href: "/stays",
  },
  {
    icon: Car,
    title: "Rent a Car",
    description: "Pick a vehicle by date range — sedans, SUVs and vans, with or without a driver.",
    href: "/rent-a-car",
  },
  {
    icon: UserCheck,
    title: "Local Experts",
    description: "Every listing is tied to a verified, admin-approved partner — not an anonymous ad.",
    href: "/account/partner",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary-400/30 blur-3xl dark:bg-primary-600/20" />
          <div className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-indigo-400/30 blur-3xl dark:bg-indigo-600/20" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
        >
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3.5 py-1 text-xs font-medium text-primary-700 dark:border-primary-900 dark:bg-primary-950 dark:text-primary-300">
            Local experts, hosts &amp; rentals — one marketplace
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-6xl dark:text-zinc-50">
            Book{" "}
            <span className="bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-transparent">
              tours, stays &amp; rides
            </span>{" "}
            with confidence.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Discover verified local experts, guides, hosts and rent-a-car partners by destination — every listing is
            admin-approved before it ever reaches you.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/tours" className={buttonVariants({ size: "lg" })}>
              Explore Tours
            </Link>
            <Link href="/account/partner" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Become a Partner
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <Link href={feature.href}>
                <Card hoverable className="flex h-full flex-col gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-md shadow-primary-600/20">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{feature.title}</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{feature.description}</p>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
