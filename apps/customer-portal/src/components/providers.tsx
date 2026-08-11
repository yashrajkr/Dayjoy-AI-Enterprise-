"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";

/**
 * Client-side providers — React Query, theme (next-themes), and both
 * toast surfaces:
 *  - Sonner — used by the API client (auto error toasts) and pages.
 *  - Radix `<Toaster>` — kept for any component that renders `<Toast>`
 *    from `@/components/ui/toast` directly.
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
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
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
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        {children}

        {/* Radix toaster — for components that use `useToast` / <Toast>. */}
        <Toaster />

        {/* Sonner — primary toast surface (auto error toasts from the API client). */}
        <SonnerToaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "rounded-lg border border-border bg-card text-card-foreground",
            },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
