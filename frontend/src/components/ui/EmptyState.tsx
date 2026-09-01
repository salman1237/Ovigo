import { Inbox, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200 px-6 py-14 text-center dark:border-zinc-800">
      <div className="rounded-full bg-primary-50 p-3 text-primary-500 dark:bg-primary-950">
        <Icon className="h-6 w-6" />
      </div>
      <p className="font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
      {description && <p className="max-w-sm text-sm text-zinc-500">{description}</p>}
      {action}
    </div>
  );
}
