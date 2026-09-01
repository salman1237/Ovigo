import { AlertTriangle } from "lucide-react";

export function ErrorState({ message = "Something went wrong. Please try again." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/60 px-6 py-14 text-center dark:border-red-900 dark:bg-red-950/20">
      <div className="rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-950 dark:text-red-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="font-medium text-red-900 dark:text-red-300">{message}</p>
    </div>
  );
}
