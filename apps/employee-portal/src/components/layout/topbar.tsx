"use client";

import Link from "next/link";
import { Bell, Menu, Search, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TopbarProps {
  onMenuClick: () => void;
  userName?: string;
  notificationsCount?: number;
}

export function Topbar({ onMenuClick, userName = "Guest", notificationsCount = 0 }: TopbarProps) {
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("");

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-void-surface/80 px-4 backdrop-blur-xl sm:px-6">
      {/* Left: mobile menu trigger + search */}
      <div className="flex flex-1 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          aria-label="Open sidebar"
          className="lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <button
          className="group flex w-full max-w-sm items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-white/[0.15] hover:bg-white/[0.05]"
          aria-label="Open command palette"
          type="button"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search tasks, tickets, customers…</span>
          <span className="hidden rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/80 sm:inline">
            ⌘K
          </span>
        </button>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Link href="/notifications">
            <Bell className="h-4 w-4" />
            {notificationsCount > 0 && (
              <span className="absolute right-2 top-2 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
              </span>
            )}
          </Link>
        </Button>

        <Separator orientation="vertical" className="hidden h-6 bg-white/10 sm:block" />

        <Link
          href="/profile"
          className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-white/[0.04]"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-aurora text-xs font-medium text-white">
              {initials || <UserCircle className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium text-foreground sm:inline">
            {userName}
          </span>
        </Link>
      </div>
    </header>
  );
}
