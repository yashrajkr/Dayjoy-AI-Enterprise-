"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { DistributorSidebar } from "./distributor-sidebar";
import { VisuallyHidden } from "@/components/visually-hidden";

/**
 * Mobile navigation — hamburger trigger that opens a slide-in drawer
 * containing the full sidebar.
 *
 * Rendered inside the `DistributorHeader` (which already wires this up),
 * but exported separately so individual pages can render their own
 * hamburger if needed.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
        <DistributorSidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
