"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInitials } from "@/lib/utils";

export function Topbar() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const order: ("light" | "dark" | "brand")[] = ["light", "dark", "brand"];
    const idx = order.indexOf(theme as (typeof order)[number]);
    setTheme(order[(idx + 1) % order.length]);
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md md:px-6">
      {/* Search */}
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search leads, customers, products, orders…"
          className="pl-9"
          aria-label="Global search"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="Notifications"
          className="relative"
        >
          <Link href="/notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
          </Link>
        </Button>

        <Link
          href="/profile"
          className="flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 py-1 transition-colors hover:bg-accent"
          aria-label="View profile"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback>AK</AvatarFallback>
          </Avatar>
          <span className="hidden text-xs font-medium sm:inline">
            Anil Kumar
          </span>
        </Link>
      </div>
    </header>
  );
}
