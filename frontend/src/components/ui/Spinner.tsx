import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

export function Spinner({ className, label = "Loading…" }: { className?: string; label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-400" role="status">
      <Loader2 className={cn("h-5 w-5 animate-spin text-primary-500", className)} />
      <span>{label}</span>
    </div>
  );
}
