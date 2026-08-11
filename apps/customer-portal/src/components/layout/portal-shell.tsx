"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Sparkles, Bell, ChevronRight } from "lucide-react";
import { NAV_ITEMS, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/store/sidebar.store";
import { useMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Portal layout — sidebar (desktop) + drawer (mobile) + sticky topbar.
 * Reads nav from `NAV_ITEMS`. Designed to be wrapped around every
 * authenticated `(portal)` route.
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useMobile();
  const mobileOpen = useSidebarStore((s) => s.mobileOpen);
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const [notificationsCount] = useState(3);

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar (mobile) */}
      {isMobile ? (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link
            href={ROUTES.dashboard}
            className="flex items-center gap-2"
            aria-label="Go to dashboard"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">Dayjoy AI</span>
          </Link>
          <Link
            href={ROUTES.notifications}
            className="relative"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {notificationsCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {notificationsCount}
              </span>
            ) : null}
            </Link>
        </header>
      ) : null}

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        {!isMobile ? (
          <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
            <SidebarHeader />
            <SidebarNav isActive={isActive} />
            <SidebarFooter />
          </aside>
        ) : null}

        {/* Mobile drawer */}
        {isMobile && mobileOpen ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card">
              <SidebarHeader onClose={() => setMobileOpen(false)} />
              <SidebarNav
                isActive={isActive}
                onNavigate={() => setMobileOpen(false)}
              />
              <SidebarFooter />
            </aside>
          </>
        ) : null}

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col">
          {!isMobile ? (
            <Topbar />
          ) : null}
          <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          <PortalFooter />
        </main>
      </div>
    </div>
  );
}

function SidebarHeader({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-border px-4">
      <Link
        href={ROUTES.dashboard}
        className="flex items-center gap-2"
        aria-label="Go to dashboard"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">
          Dayjoy AI Portal
        </span>
      </Link>
      {onClose ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

function SidebarNav({
  isActive,
  onNavigate,
}: {
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((section) => (
        <div key={section.section}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {section.section}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="shrink-0 border-t border-border p-3">
      <Link
        href={ROUTES.support}
        className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80"
      >
        <span className="flex h-2 w-2 rounded-full bg-success" />
        <span className="flex-1">All systems operational</span>
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-card/95 px-6 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Customer Portal</span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={ROUTES.notifications}
          className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-md p-1 hover:bg-accent"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>JS</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Jane Smith</span>
                <span className="text-xs text-muted-foreground">
                  jane@example.com
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">My Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={ROUTES.orders}>My Orders</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={ROUTES.settings}>Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={ROUTES.login} className="text-destructive">
                Sign out
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function PortalFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card px-6 py-4 text-xs text-muted-foreground">
      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <p>© {new Date().getFullYear()} Dayjoy AI. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/support" className="hover:text-foreground">
            Support
          </Link>
          <Link href="/support/knowledge-base" className="hover:text-foreground">
            Knowledge Base
          </Link>
          <Link href="/settings" className="hover:text-foreground">
            Settings
          </Link>
        </div>
      </div>
    </footer>
  );
}
