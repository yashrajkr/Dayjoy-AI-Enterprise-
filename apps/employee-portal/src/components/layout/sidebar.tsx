"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, NAV_ITEMS, STORAGE_KEYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Sparkles, X } from "lucide-react";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  /**
   * Optional role used to filter nav items that carry a `roles` restriction.
   * Accepts any string to remain decoupled from the canonical role union.
   */
  userRole?: string | null;
}

/**
 * Portal sidebar — collapses into a slide-in drawer on small screens.
 *
 * `NAV_ITEMS` (in `lib/constants.ts`) is the single source of truth; items
 * with `roles` set are hidden unless the current user has a matching role.
 */
export function Sidebar({ open, onClose, userRole = null }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
    setCollapsed(stored === "true");
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(next));
    }
  }

  function isItemVisible(roles: readonly string[] | null | undefined) {
    if (!roles || roles.length === 0) return true;
    if (!userRole) return true; // No role context yet — show all (auth-gated by route).
    return roles.includes(userRole);
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/[0.06] bg-void-surface/95 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0",
          collapsed ? "w-16" : "w-64",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2 border-b border-white/[0.06] px-4">
          <Link href="/" className="flex items-center gap-2" onClick={onClose}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-aurora shadow-glow">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            {!collapsed && (
              <span className="truncate text-sm font-semibold text-foreground">
                {APP_NAME}
              </span>
            )}
          </Link>
          <button
            type="button"
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-white/[0.05] lg:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {NAV_ITEMS.map((section) => {
            const visible = section.items.filter((i) => isItemVisible(i.roles));
            if (visible.length === 0) return null;
            return (
              <div key={section.section} className="mb-4">
                {!collapsed && (
                  <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {section.section}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {visible.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                            active
                              ? "bg-aurora text-white shadow-glow"
                              : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                            collapsed && "justify-center",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <span className="flex-1 truncate">{item.label}</span>
                          )}
                          {!collapsed && item.badge && (
                            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden h-12 border-t border-white/[0.06] px-4 text-xs text-muted-foreground hover:bg-white/[0.04] lg:flex lg:items-center lg:justify-center"
        >
          {collapsed ? "→" : "← Collapse"}
        </button>
      </aside>
    </>
  );
}
