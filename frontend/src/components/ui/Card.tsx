import { type HTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement | HTMLFormElement> {
  hoverable?: boolean;
  as?: "div" | "form";
}

export const Card = forwardRef<HTMLDivElement | HTMLFormElement, CardProps>(
  ({ className, hoverable, as = "div", ...props }, ref) => {
    const Comp = as;
    return (
      <Comp
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Comp is narrowed to "div" | "form"; ref/props union across both intrinsic elements isn't representable without this
        ref={ref as any}
        className={cn(
          "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
          hoverable &&
            "transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-600/10 dark:hover:border-primary-800",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";
