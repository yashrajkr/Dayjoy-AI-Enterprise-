"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { ChevronLeft, ChevronRight, Menu, Sparkles, X } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Sidebar — collapsible desktop navigation + mobile drawer.
 *
 * Renders ALL nav sections (foundation + features). Items whose routes
 * haven't been implemented yet (e.g. /dashboard) will 404 — this is
 * expected during parallel development.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("dj_sidebar_collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("dj_sidebar_collapsed", String(next));
  };

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <>
      {/* Mobile trigger button — visible only on small screens */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay + drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar">
            <SidebarHeader collapsed={false} onClose={() => setMobileOpen(false)} />
            <SidebarNav
              isActive={isActive}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
        style={{ transition: "width 0.2s ease" }}
      >
        <SidebarHeader collapsed={collapsed} />
        <SidebarNav isActive={isActive} collapsed={collapsed} />
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

function SidebarHeader({
  collapsed,
  onClose,
}: {
  collapsed: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 overflow-hidden"
        aria-label="Go to dashboard"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              Dayjoy
            </span>
            <span className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
              Distributor
            </span>
          </div>
        )}
      </Link>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface SidebarNavProps {
  isActive: (href: string) => boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarNav({ isActive, collapsed, onNavigate }: SidebarNavProps) {
  return (
    <nav
      className="flex-1 space-y-5 overflow-y-auto px-3 py-5"
      aria-label="Primary"
    >
      {NAV_SECTIONS.map((section) => (
        <div key={section.section}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {section.section}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href);
              const Icon = (Icons as Record<string, Icons.LucideIcon>)[item.icon] ?? Icons.Circle;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}
                  {!collapsed && item.badge && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
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
  );
}
