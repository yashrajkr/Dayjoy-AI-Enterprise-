"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/api";

interface ErrorStateProps {
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/**
 * ErrorState — reusable error card shown when a React Query fetch
 * fails. Displays the backend's error message (if any) and an optional
 * retry button.
 */
export function ErrorState({
  error,
  title = "Something went wrong",
  description,
  onRetry,
}: ErrorStateProps) {
  const message = description ?? getErrorMessage(error);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-14 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * LoadingState — simple centered spinner shown while React Query
 * fetches the first page of data.
 */
export function LoadingState({
  label = "Loading…",
}: {
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
