"use client";

// Minimal Toaster shell for backward compat with shadcn/ui-style imports.
// Most notifications use Sonner (`sonner`) — this just renders the viewport.
import { ToastProvider, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  return (
    <ToastProvider swipeDirection="right">
      <ToastViewport />
    </ToastProvider>
  );
}

export { useToast } from "@/hooks/use-toast";
