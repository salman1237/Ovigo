"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { TokenPair } from "@/types/user";

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or phone is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      const tokens = await apiClient.post<TokenPair>("/api/v1/auth/login", data);
      setSession(tokens);
      router.push("/");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary-400/25 blur-3xl dark:bg-primary-600/15" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <Card className="p-7">
          <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-md shadow-primary-600/30">
            <Sparkles className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to continue to Ovigo.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
            <Input
              label="Email or phone"
              {...register("identifier")}
              type="text"
              error={errors.identifier?.message}
            />
            <Input label="Password" {...register("password")} type="password" error={errors.password?.message} />

            {serverError && <p className="text-sm text-red-600">{serverError}</p>}

            <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Don&apos;t have an account?{" "}
            <Link href="/account/register" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
              Create one
            </Link>
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
