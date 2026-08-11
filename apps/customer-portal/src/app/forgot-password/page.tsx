"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { ROUTES } from "@/lib/constants";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

type ForgotValues = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotValues) => {
    setServerError(null);
    try {
      await forgotPassword({ email: values.email });
      setSubmittedEmail(values.email);
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  if (submittedEmail) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="We've sent a password reset link to your inbox."
        footer={
          <p>
            Remembered your password?{" "}
            <Link
              href={ROUTES.login}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        }
      >
        <div className="rounded-xl border border-success/25 bg-success/5 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <MailCheck className="h-6 w-6 text-success" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            Reset link sent
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent an email to{" "}
            <span className="font-medium text-foreground">
              {submittedEmail}
            </span>
            . Click the link inside to choose a new password.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Didn&apos;t get it? Check your spam folder, or wait a minute
            and try again.
          </p>
        </div>
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => setSubmittedEmail(null)}
        >
          Try a different email
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email and we'll send you a link to reset your password."
      footer={
        <p>
          Remembered your password?{" "}
          <Link
            href={ROUTES.login}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <Button
          type="submit"
          variant="gradient"
          className="w-full"
          loading={isSubmitting}
        >
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
