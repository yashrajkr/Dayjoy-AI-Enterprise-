"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserCircle,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { DistributorSidebar } from "./distributor-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useDistributor } from "@/hooks/use-distributor";
import {
  formatCurrencyCompact,
  formatNumber,
  getInitials,
  tierMeta,
} from "@/lib/utils";
import { VisuallyHidden } from "@/components/visually-hidden";

/**
 * Distributor header — sticky top bar.
 *
 * Left: mobile hamburger (opens the sidebar Sheet) + quick-search button.
 * Middle/right:
 *   - "Today's sales" quick stat (read from the cached distributor profile)
 *   - Theme toggle (light/dark)
 *   - Notifications bell (with unread-count badge)
 *   - Profile dropdown (name + tier, links to profile/settings/logout)
 */
export function DistributorHeader() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, distributor, logout } = useAuth();
  const { performance } = useDistributor();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const displayName =
    distributor?.contactPerson ||
    distributor?.companyName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "Distributor";
  const tier = distributor?.tier ?? "BRONZE";
  const tierInfo = tierMeta(tier);

  const todaysSales =
    performance?.sales.byMonth?.[performance.sales.byMonth.length - 1]?.total ??
    distributor?.monthlySales ??
    0;

  const initials = getInitials(displayName);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-6">
      {/* Mobile nav trigger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <VisuallyHidden>
            <SheetTitle>Navigation</SheetTitle>
          </VisuallyHidden>
          <DistributorSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Quick search (decorative for now) */}
      <Button
        variant="outline"
        className="hidden w-full max-w-xs justify-start gap-2 px-3 text-muted-foreground md:flex"
        onClick={() => router.push("/knowledge")}
      >
        <Search className="h-4 w-4" />
        <span className="text-sm">Search products, customers…</span>
      </Button>

      <div className="flex-1" />

      {/* Today's sales quick stat */}
      <div className="hidden items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 sm:flex">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            This Month
          </span>
          <span className="text-xs font-semibold text-foreground">
            {formatCurrencyCompact(todaysSales)}
          </span>
        </div>
      </div>

      {/* Pending payout quick stat */}
      <Link
        href="/earnings"
        className="hidden items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 lg:flex"
      >
        <Wallet className="h-3.5 w-3.5 text-amber-600" />
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Pending
          </span>
          <span className="text-xs font-semibold text-foreground">
            {formatCurrencyCompact(distributor?.monthlyCommission ?? 0)}
          </span>
        </div>
      </Link>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {mounted &&
          (theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          ))}
      </Button>

      {/* Notifications */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        className="relative"
        onClick={() => router.push("/notifications")}
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      </Button>

      {/* Profile dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-accent"
            aria-label="Account menu"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.avatarUrl} alt={displayName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="hidden flex-col items-start leading-tight md:flex">
              <span className="max-w-[140px] truncate text-xs font-semibold text-foreground">
                {displayName}
              </span>
              <Badge
                variant="outline"
                className={`h-4 px-1.5 text-[10px] ${tierInfo.color}`}
              >
                {tierInfo.label}
              </Badge>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{displayName}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user?.email}
              </span>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="outline" className={tierInfo.color}>
                  {tierInfo.label} Tier
                </Badge>
                {distributor?.distributorCode && (
                  <span className="text-[10px] text-muted-foreground">
                    Code: {distributor.distributorCode}
                  </span>
                )}
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile" className="cursor-pointer">
              <UserCircle className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/earnings" className="cursor-pointer">
              <Wallet className="h-4 w-4" />
              Earnings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="cursor-pointer">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              logout();
            }}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
