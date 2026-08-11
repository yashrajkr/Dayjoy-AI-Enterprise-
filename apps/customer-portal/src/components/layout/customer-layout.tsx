"use client";

import type { ReactNode } from "react";
import { CustomerHeader } from "@/components/layout/customer-header";
import { CustomerFooter } from "@/components/layout/customer-footer";
import { CustomerSidebar } from "@/components/layout/customer-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CartDrawer } from "@/components/cart/cart-drawer";

/**
 * CustomerLayout — the authenticated shell.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │ CustomerHeader (sticky, h-16)          │
 *   ├──────────┬─────────────────────────────┤
 *   │ Sidebar  │ main (flex-1, min-w-0)      │
 *   │ (md+)    │                             │
 *   │          │                             │
 *   ├──────────┴─────────────────────────────┤
 *   │ CustomerFooter (mt-auto)               │
 *   └────────────────────────────────────────┘
 *
 * The root wrapper uses `min-h-screen flex flex-col` so the footer
 * sticks to the bottom when content is short and pushes down
 * naturally when content overflows.
 */
export function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <CustomerHeader />
      <MobileNav />
      <div className="flex flex-1">
        <CustomerSidebar />
        <main className="flex-1 min-w-0">
          <div className="container mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
      <CustomerFooter />
      <CartDrawer />
    </div>
  );
}
