"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserCog,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PORTAL_NAME } from "@/lib/constants";
import { cn, getInitials } from "@/lib/utils";
import { useEmployee } from "@/hooks/use-employee";
import { useAuth } from "@/hooks/use-auth";
import { useUIStore } from "@/store/ui.store";

export function EmployeeHeader() {
  const router = useRouter();
  const { employee } = useEmployee();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);

  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    router.push(`/crm/customers?search=${encodeURIComponent(search)}`);
  };

  const departmentBadge = employee?.department ? (
    <Badge variant="secondary" className="hidden sm:inline-flex">
      {employee.department.replace(/_/g, " ").toLowerCase()}
    </Badge>
  ) : null;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 md:hidden"
        aria-label={`${PORTAL_NAME} — home`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <span className="text-sm font-bold">D</span>
        </span>
      </Link>

      <form
        onSubmit={handleSearch}
        className="hidden flex-1 items-center sm:flex"
      >
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers, tickets…"
            className="h-9 pl-9"
            aria-label="Global search"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {departmentBadge}

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>

        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="relative"
        >
          <Link href="/notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </Link>
        </Button>

        <Separator orientation="vertical" className="hidden h-6 bg-border sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-md p-1 pr-2 text-sm outline-none transition-colors hover:bg-accent"
              aria-label="Open user menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={employee?.avatarUrl}
                  alt={employee?.fullName ?? employee?.firstName ?? "User"}
                />
                <AvatarFallback>
                  {getInitials(
                    employee?.fullName ??
                      employee?.firstName ??
                      "User",
                  )}
                </AvatarFallback>
              </Avatar>
              <span className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-xs font-medium text-foreground">
                  {employee?.firstName ?? "Employee"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {employee?.role?.toLowerCase()}
                </span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {employee?.fullName ??
                    `${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {employee?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserCog className="h-4 w-4" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function HeaderAction({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>;
}
