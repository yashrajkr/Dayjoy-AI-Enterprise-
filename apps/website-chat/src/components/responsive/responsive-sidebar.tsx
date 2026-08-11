"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/mobile";

/**
 * ResponsiveSidebar — renders a static aside on desktop, a slide-in
 * Sheet-style drawer on mobile. Trigger button is hidden on desktop.
 *
 * Props:
 *  - `children`: sidebar content (nav, header, footer, etc.)
 *  - `side`: which side the drawer slides in from (default `left`)
 *  - `width`: desktop aside width in `px` (default `264`)
 *  - `mobileWidth`: drawer width in `px` (default `288`)
 *  - `className`: optional className for the desktop aside
 *  - `triggerClassName`: optional className for the mobile trigger button
 *  - `triggerLabel`: accessible label for the trigger button
 *
 * The mobile drawer is controlled internally; closing happens on
 * backdrop click, Escape key, or programmatic close.
 *
 * Accessibility:
 *  - Trigger button has `aria-label` and `aria-expanded`.
 *  - Drawer has `role="dialog"` and `aria-modal="true"`.
 *  - Escape key closes the drawer.
 *  - Body scroll is locked while the drawer is open.
 */
export interface ResponsiveSidebarProps {
  children: React.ReactNode;
  side?: "left" | "right";
  width?: number;
  mobileWidth?: number;
  className?: string;
  triggerClassName?: string;
  triggerLabel?: string;
}

export function ResponsiveSidebar({
  children,
  side = "left",
  width = 264,
  mobileWidth = 288,
  className,
  triggerClassName,
  triggerLabel = "Open menu",
}: ResponsiveSidebarProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const drawerRef = React.useRef<HTMLDivElement>(null);

  // Close on Escape, lock body scroll while open.
  React.useEffect(() => {
    if (!isMobile || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobile, open]);

  // Close the mobile drawer when resizing back to desktop.
  React.useEffect(() => {
    if (!isMobile && open) setOpen(false);
  }, [isMobile, open]);

  // ===== Mobile drawer =====
  if (isMobile) {
    const isLeft = side === "left";
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={triggerLabel}
          aria-expanded={open}
          aria-controls="responsive-sidebar-drawer"
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent lg:hidden",
            triggerClassName,
          )}
        >
          <Menu className="h-5 w-5" />
        </button>

        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                aria-hidden="true"
              />
              <motion.div
                key="drawer"
                id="responsive-sidebar-drawer"
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-label={triggerLabel}
                initial={{ x: isLeft ? "-100%" : "100%" }}
                animate={{ x: 0 }}
                exit={{ x: isLeft ? "-100%" : "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{ width: mobileWidth, [side]: 0 } as React.CSSProperties}
                className="fixed inset-y-0 z-50 flex flex-col border-border bg-card shadow-2xl"
              >
                {children}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="absolute right-3 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ===== Desktop aside =====
  return (
    <aside
      style={{ width }}
      className={cn("hidden shrink-0 lg:flex lg:flex-col", className)}
    >
      {children}
    </aside>
  );
}
