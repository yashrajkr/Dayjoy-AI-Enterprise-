"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ShoppingCart,
  Bell,
  Menu,
  Sun,
  Moon,
  User as UserIcon,
  LogOut,
  Package,
  Settings,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { BrandLockup } from "@/components/layout/customer-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useAppTheme } from "@/hooks/use-theme";
import { useUIStore } from "@/store/ui.store";
import { getInitials } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import type { Notification } from "@/types/notification.types";

/**
 * Customer header — sticky top bar with brand, search, cart, theme
 * toggle, notifications dropdown, and the profile menu.
 */
export function CustomerHeader() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { itemCount, toggleCart } = useCart();
  const { theme, resolvedTheme, toggleTheme, mounted } = useAppTheme();
  const toggleMobileNav = useUIStore((s) => s.toggleMobileNav);

  const { data: notifications } = useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: () => api.paginated<Notification>("/notifications", { limit: 5 }),
    enabled: !!user,
    staleTime: 30 * 1000,
  });
  const unreadCount =
    notifications?.data.filter((n) => !n.read).length ?? 0;

  const fullName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : "Guest";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
      {/* Left — mobile menu + brand */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={toggleMobileNav}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <BrandLockup />
      </div>

      {/* Center — search (hidden on mobile, expands on md+) */}
      <Suspense fallback={<div className="hidden flex-1 md:block" />}>
        <SearchBar />
      </Suspense>

      {/* Right — actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="hidden sm:inline-flex"
        >
          {mounted &&
            (resolvedTheme === "dark" || theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            ))}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              className="relative"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {unreadCount} new
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications?.data.length ? (
              notifications.data.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className="flex-col items-start gap-0.5 py-2"
                >
                  <span className="text-sm font-medium text-foreground">
                    {n.title}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {n.message}
                  </span>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                You&apos;re all caught up
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/notifications"
                className="justify-center text-center text-xs font-medium text-primary"
              >
                View all notifications
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Cart */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCart}
          aria-label="Open cart"
          className="relative"
        >
          <ShoppingCart className="h-4 w-4" />
          {itemCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {itemCount > 9 ? "9+" : itemCount}
            </span>
          )}
        </Button>

        {/* Profile menu */}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-accent"
                aria-label="Account menu"
              >
                <Avatar className="h-7 w-7 border border-border">
                  {user.avatarUrl && (
                    <AvatarImage src={user.avatarUrl} alt={fullName} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {getInitials(fullName)}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {fullName}
                </span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserIcon className="h-4 w-4" /> Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/orders">
                  <Package className="h-4 w-4" /> My Orders
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="h-4 w-4" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="gradient"
            size="sm"
            onClick={() => router.push("/login")}
          >
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}

function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/products/search?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/products");
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="relative hidden w-full max-w-md md:block"
      role="search"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products, brands, categories…"
        className="pl-9"
        aria-label="Search products"
      />
    </form>
  );
}
