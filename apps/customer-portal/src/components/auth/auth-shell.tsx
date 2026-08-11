"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { APP_NAME, APP_NAME_FULL } from "@/lib/constants";

/**
 * AuthShell — split-screen layout shared by all auth pages (login,
 * register, forgot/reset password, verify-otp).
 *
 * Left panel (desktop only): brand hero with the Dayjoy value
 * proposition. Right panel: the auth form card.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left — brand hero */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-dayjoy-500 via-dayjoy-600 to-dayjoy-800 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px)] [background-size:32px_32px]" />

        <Link href="/" className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </Link>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Welcome to the {APP_NAME_FULL} Customer Portal
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Browse products, place orders, chat with our AI assistant,
            track deliveries, and manage your account — all in one
            place, built for you.
          </p>

          <ul className="mt-6 space-y-2 text-sm text-white/90">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Free shipping on orders over ₹1,000
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              24/7 AI assistant for instant support
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Earn reward points on every purchase
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-white/60">
          © {new Date().getFullYear()} {APP_NAME_FULL}. All rights
          reserved.
        </p>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <Link
            href="/"
            className="mb-8 flex items-center justify-center gap-2 lg:hidden"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient shadow-glow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold">{APP_NAME}</span>
          </Link>

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {children}

          {footer && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
