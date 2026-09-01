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

const registerSchema = z
  .object({
    full_name: z.string().min(2, "Enter your full name"),
    email: z.string().email("Enter a valid email").or(z.literal("")).optional(),
    phone: z.string().optional(),
    password: z.string().min(8, "At least 8 characters"),
  })
  .refine((data) => data.email || data.phone, {
    message: "Provide an email or phone number",
    path: ["email"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterForm) => {
    setServerError(null);
    try {
      const payload = { ...data, email: data.email || undefined, phone: data.phone || undefined };
      const tokens = await apiClient.post<TokenPair>("/api/v1/auth/register", payload);
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
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Create your account</h1>
          <p className="mt-1 text-sm text-zinc-500">Join Ovigo as a traveler.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
            <Input label="Full name" {...register("full_name")} type="text" error={errors.full_name?.message} />
            <Input label="Email" {...register("email")} type="email" error={errors.email?.message} />
            <Input
              label="Phone"
              hint="Optional if email is provided"
              {...register("phone")}
              type="text"
            />
            <Input label="Password" {...register("password")} type="password" error={errors.password?.message} />

            {serverError && <p className="text-sm text-red-600">{serverError}</p>}

            <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
              Sign in
            </Link>
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
