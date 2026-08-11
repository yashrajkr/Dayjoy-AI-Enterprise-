"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { APP_NAME, PORTAL_NAME } from "@/lib/constants";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { login, isLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password, values.rememberMe);
      const redirect = search.get("redirect") || "/dashboard";
      router.push(redirect);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      setServerError(message);
    }
  };

  return (
    <div className="relative flex min-h-screen bg-background">
      <div className="bg-noise pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full bg-primary/15 blur-[140px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[440px] w-[440px] rounded-full bg-amber-400/10 blur-[140px]" />

      {/* Left — brand hero (desktop only) */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-border px-12 py-10 lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">
              {APP_NAME}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {PORTAL_NAME}
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-md"
        >
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
            Your workspace for{" "}
            <span className="text-gradient-warm">customers, tasks, and AI</span>.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            One focused portal for daily operations — manage your tasks, look
            up customers and distributors, resolve support tickets, and lean on
            the AI assistant for the heavy lifting.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { icon: BadgeCheck, label: "Tasks & CRM" },
              { icon: Building2, label: "Tickets" },
              { icon: Sparkles, label: "AI Assistant" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border bg-card/60 p-3 backdrop-blur-sm"
              >
                <item.icon className="h-4 w-4 text-primary" />
                <p className="mt-2 text-xs font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </div>

      {/* Right — auth form */}
      <div className="relative flex flex-1 items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <Card>
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm lg:hidden">
                <Sparkles className="h-5 w-5" />
              </div>
              <CardTitle>Employee sign in</CardTitle>
              <CardDescription>
                Use your company credentials to continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                role="note"
                className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              >
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Employee login only.</strong> Customers and
                  distributors should use their dedicated portals.
                </span>
              </div>

              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
                noValidate
              >
                {serverError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{serverError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@dayjoyai.com"
                    aria-invalid={!!errors.email}
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                  {errors.password && (
                    <p className="text-xs text-destructive">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    {...register("rememberMe")}
                  />
                  Keep me signed in for 7 days
                </label>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Forgot your password? Contact your IT administrator.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
