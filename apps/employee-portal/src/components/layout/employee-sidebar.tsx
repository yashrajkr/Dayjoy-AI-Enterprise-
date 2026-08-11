"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Sparkles } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";
import { useMobile } from "@/hooks/use-mobile";
import { MobileNav } from "./mobile-nav";

/**
 * Employee sidebar — collapsible desktop navigation. The mobile drawer is
 * handled by `MobileNav`.
 */
export function EmployeeSidebar() {
  const pathname = usePathname();
  const isMobile = useMobile();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  if (isMobile) {
    return <MobileNav />;
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 264 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="relative flex h-screen shrink-0 flex-col border-r border-border bg-card"
    >
      <SidebarHeader collapsed={collapsed} />

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {NAV_ITEMS.map((section) => (
          <div key={section.section}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
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
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-md bg-accent ring-1 ring-inset ring-primary/30"
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
                    {!collapsed && item.badge && (
                      <span className="relative z-10 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <button
          onClick={toggle}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
}

function SidebarHeader({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 overflow-hidden"
        aria-label="Go to dashboard"
      >
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              Dayjoy AI
            </span>
            <span className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
              Employee
            </span>
          </div>
        )}
      </Link>
    </div>
  );
}
