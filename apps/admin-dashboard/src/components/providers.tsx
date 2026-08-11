"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";

/**
 * Client-side providers — React Query, theme (next-themes), and both
 * toast surfaces (the legacy Radix `<Toaster>` for backward compat +
 * Sonner for new code, including the auto-toasts emitted by the API
 * client's response interceptor).
 *
 * The `QueryClient` is created lazily per-render via `useState` so it
 * survives re-renders without leaking across requests on the server.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnMount: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        themes={["light", "dark", "brand"]}
        disableTransitionOnChange
      >
        {children}

        {/* Legacy Radix toaster — kept for backward compat with existing
            pages that render `<Toast>` from `@/components/ui/toast`. */}
        <Toaster />

        {/* Sonner — used by the API client (auto error toasts) and the
            `useToast` hook. */}
        <SonnerToaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: "rounded-lg border border-border bg-card text-card-foreground",
            },
          }}
        />

      </ThemeProvider>
    </QueryClientProvider>
  );
}
