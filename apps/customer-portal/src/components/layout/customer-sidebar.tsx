"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { useUIStore } from "@/store/ui.store";

/**
 * Customer sidebar — desktop rail (collapsible) + the desktop-only nav.
 * The mobile drawer lives in `mobile-nav.tsx`.
 *
 * Sections + items come from `NAV_ITEMS` in `@/lib/constants`.
 */
export function CustomerSidebar() {
  const pathname = usePathname();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 256 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur-sm md:flex"
    >
      <SidebarNav visibleSections={NAV_ITEMS} isActive={isActive} collapsed={collapsed} />
      <div className="shrink-0 border-t border-border p-3">
        <button
          onClick={toggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "→" : "← Collapse"}
        </button>
      </div>
    </motion.aside>
  );
}

interface SidebarNavProps {
  visibleSections: typeof NAV_ITEMS;
  isActive: (href: string) => boolean;
  collapsed?: boolean;
}

function SidebarNav({ visibleSections, isActive, collapsed }: SidebarNavProps) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {visibleSections.map((section) => (
        <div key={section.section}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {section.section}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-lg bg-accent ring-1 ring-inset ring-primary/25"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative z-10 h-4 w-4 shrink-0",
                      active && "text-primary",
                    )}
                  />
                  {!collapsed && (
                    <span className="relative z-10 flex-1 truncate">
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Brand lockup — reused by the header and mobile nav. */
export function BrandLockup({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2 overflow-hidden"
      aria-label="Dayjoy home"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg brand-gradient shadow-glow">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      {!collapsed && (
        <span className="truncate text-base font-semibold tracking-tight text-foreground">
          Dayjoy
        </span>
      )}
    </Link>
  );
}
