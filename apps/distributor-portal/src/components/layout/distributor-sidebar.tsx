"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Distributor sidebar — grouped navigation.
 *
 * Sections + items come from `NAV_ITEMS` in `@/lib/constants`. The
 * active item gets a primary-tinted background + left accent bar.
 *
 * Used in two contexts:
 *   - Desktop: persistent, fixed-width column (`hidden lg:flex`).
 *   - Mobile: rendered inside the `MobileNav` sheet drawer.
 */
export function DistributorSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2.5"
          aria-label="Go to dashboard"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight text-foreground">
              Dayjoy AI
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Distributor Portal
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-6">
          {NAV_ITEMS.map((section) => (
            <div key={section.section}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {section.section}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full border-l-2 border-primary"
                        />
                      )}
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
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
      </ScrollArea>

      {/* Footer */}
      <div className="shrink-0 border-t border-border p-4">
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Need help?</p>
          <p className="mt-0.5 leading-relaxed">
            Reach out to your sponsor or visit the Knowledge Base.
          </p>
        </div>
      </div>
    </div>
  );
}
