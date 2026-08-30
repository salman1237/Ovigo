"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

export function Header() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const router = useRouter();

  const isAdmin = user?.system_role === "admin" || user?.system_role === "super_admin";

  const handleLogout = async () => {
    try {
      await apiClient.post("/api/v1/auth/logout", undefined, { auth: true });
    } catch {
      // stateless JWTs — logout endpoint has nothing to invalidate server-side yet
    }
    clearSession();
    router.push("/");
  };

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <Link href="/" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Ovigo
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            <Link href="/account/partner" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Become a Partner
            </Link>
            {isAdmin && (
              <Link href="/admin/partners" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                Admin
              </Link>
            )}
            <span className="text-zinc-400">{user.full_name}</span>
            <button onClick={handleLogout} className="font-medium text-zinc-900 dark:text-zinc-50">
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/account/login" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Sign in
            </Link>
            <Link href="/account/register" className="font-medium text-zinc-900 dark:text-zinc-50">
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
