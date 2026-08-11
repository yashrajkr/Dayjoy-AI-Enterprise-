"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={null}>
      <VerifyOtpForm />
    </Suspense>
  );
}

function VerifyOtpForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { verifyOtp, resendOtp } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const email = search.get("email") ?? "";
  const purpose = (search.get("purpose") as "verify_email" | "login_2fa" | "reset_password" | null) ?? "verify_email";

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const updateDigit = (idx: number, raw: string) => {
    const val = raw.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
    if (val && idx < OTP_LENGTH - 1) {
      inputs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
  ) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) inputs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < OTP_LENGTH - 1)
      inputs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((c, i) => (next[i] = c));
    setDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputs.current[focusIdx]?.focus();
  };

  const otp = digits.join("");
  const isComplete = otp.length === OTP_LENGTH;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete || !email) return;
    setServerError(null);
    try {
      await verifyOtp({ email, otp, purpose });
      router.push(ROUTES.dashboard);
      router.refresh();
    } catch (err) {
      setServerError(getErrorMessage(err));
      setDigits(Array(OTP_LENGTH).fill(""));
      inputs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    setServerError(null);
    try {
      await resendOtp(email);
      setResendCooldown(30);
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  return (
    <AuthShell
      title="Verify your email"
      subtitle={
        email
          ? `Enter the ${OTP_LENGTH}-digit code we sent to ${email}.`
          : "Enter the 6-digit code we sent to your email."
      }
      footer={
        <p>
          Need help?{" "}
          <Link
            href={ROUTES.support}
            className="font-medium text-primary hover:underline"
          >
            Contact support
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
          <Label htmlFor="otp-0">Verification code</Label>
          <div
            className="flex justify-between gap-2"
            onPaste={handlePaste}
            role="group"
            aria-label="6-digit verification code"
          >
            {digits.map((d, idx) => (
              <Input
                key={idx}
                id={`otp-${idx}`}
                ref={(el) => {
                  inputs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={d}
                onChange={(e) => updateDigit(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={cn(
                  "h-12 w-12 rounded-lg border-border text-center text-lg font-semibold",
                  d && "border-primary/50",
                )}
                aria-label={`Digit ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        <Button
          type="submit"
          variant="gradient"
          className="w-full"
          disabled={!isComplete}
          loading={false}
        >
          Verify & continue
        </Button>
      </form>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        Didn&apos;t receive a code?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
        >
          <RefreshCw className="h-3 w-3" />
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
        </button>
      </div>
    </AuthShell>
  );
}
