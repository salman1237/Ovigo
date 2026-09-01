import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
      primary: "bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300",
      success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
      warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
