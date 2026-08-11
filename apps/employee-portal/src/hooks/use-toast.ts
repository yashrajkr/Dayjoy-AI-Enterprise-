"use client";

import { toast as sonnerToast } from "sonner";

/**
 * Thin `useToast` shim — maps the shadcn/ui-style API onto Sonner so any
 * legacy call sites (`toast({ title, description })`) keep working.
 *
 * New code should import `toast` from `sonner` directly.
 */
export function useToast() {
  return {
    toast: (props: {
      title?: string;
      description?: string;
      variant?: "default" | "success" | "destructive";
    }) => {
      const { title, description, variant } = props;
      if (variant === "destructive") {
        sonnerToast.error(title ?? "Error", { description });
      } else if (variant === "success") {
        sonnerToast.success(title ?? "Success", { description });
      } else {
        sonnerToast(title ?? "Notification", { description });
      }
    },
  };
}
