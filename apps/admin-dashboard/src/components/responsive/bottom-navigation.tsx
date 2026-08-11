"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/mobile";

/**
 * BottomNavigation — a fixed bottom navigation bar shown on mobile
 * only (≤768px), in the style of native iOS/Android apps. Hidden on
 * desktop where the sidebar is always visible.
 *
 * Pass up to 5 nav items. The current item is highlighted using
 * `usePathname()`. The bar respects the iOS safe-area-inset so it
 * never overlaps the home indicator.
 *
 * ```tsx
 * <BottomNavigation
 *   items={[
 *     { label: "Home", href: "/", icon: Home },
 *     { label: "Search", href: "/search", icon: Search },
 *     { label: "Profile", href: "/profile", icon: User },
 *   ]}
 * />
 * ```
 *
 * Accessibility:
 *  - Renders `<nav aria-label="Primary">`.
 *  - Each link has `aria-current="page"` when active.
 *  - Active item: label + icon use primary color.
 *  - Inactive items: muted color, label shrinks to `text-[10px]`.
 */
export interface BottomNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Optional badge count rendered as a small dot. */
  badge?: number;
  /** Optional match function — defaults to `pathname === href`. */
  isActive?: (pathname: string) => boolean;
}

export interface BottomNavigationProps {
  items: BottomNavItem[];
  /** Extra className for the outer `<nav>`. */
  className?: string;
  /** ARIA label for the nav element. */
  ariaLabel?: string;
}

export function BottomNavigation({
  items,
  className,
  ariaLabel = "Primary",
}: BottomNavigationProps) {
  const isMobile = useIsMobile();
  const pathname = usePathname();

  if (!isMobile) return null;
  if (items.length === 0) return null;
  // Cap to 5 items (Material guideline).
  const visible = items.slice(0, 5);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-lg",
        // Respect iOS safe-area-inset-bottom
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
      style={{ paddingBottom: "var(--safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {visible.map((item) => {
          const active = item.isActive
            ? item.isActive(pathname ?? "")
            : pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span
                      aria-label={`${item.badge} unread`}
                      className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground"
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </span>
                <span className="leading-none">{item.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
