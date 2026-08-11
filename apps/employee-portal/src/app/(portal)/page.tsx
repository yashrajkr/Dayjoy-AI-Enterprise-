"use client";

import Link from "next/link";
import {
  CalendarClock,
  FileBarChart,
  BarChart3,
  UsersRound,
  UserCircle,
  Settings,
  ListTodo,
  Ticket,
  Bot,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

/**
 * Dashboard placeholder.
 *
 * NOTE: Agent 5 owns the real dashboard (auth-gated summary of tasks,
 * tickets, CRM, AI, chat, notifications). This placeholder exists so
 * that `/` renders during concurrent development — Agent 5 will
 * replace this file with the real implementation.
 */
const QUICK_LINKS = [
  { label: "Tasks", href: "/tasks", icon: ListTodo, description: "Your daily task queue" },
  { label: "Tickets", href: "/tickets", icon: Ticket, description: "Support tickets assigned to you" },
  { label: "AI Assistant", href: "/ai", icon: Bot, description: "Draft replies, summarise, search" },
  { label: "Attendance", href: "/attendance", icon: CalendarClock, description: "Check in/out, leave" },
  { label: "Reports", href: "/reports", icon: FileBarChart, description: "Sales, tickets, performance" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, description: "Your productivity & CSAT" },
  { label: "Team", href: "/team", icon: UsersRound, description: "Manage your team (managers)" },
  { label: "Profile", href: "/profile", icon: UserCircle, description: "Personal, employment, security" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Theme, language, notifications" },
];

const KPIS = [
  { label: "Tasks Completed (Today)", value: "6", delta: "+2", hint: "vs. yesterday" },
  { label: "Open Tickets", value: "4", delta: "−1", hint: "vs. yesterday" },
  { label: "Leads in Pipeline", value: "11", delta: "+3", hint: "this week" },
  { label: "Avg CSAT (7d)", value: "4.6", delta: "+0.2", hint: "out of 5" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Welcome back, Vivaan"
        description="Here's what's happening across your work today."
        actions={
          <Badge variant="live" dot>
            Live · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </Badge>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-3xl">{kpi.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-xs">
                <span className={kpi.delta.startsWith("−") ? "text-destructive" : "text-success"}>
                  {kpi.delta}
                </span>
                <span className="text-muted-foreground">{kpi.hint}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick links */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Quick links</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Card key={link.href} interactive className="cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-aurora shadow-glow">
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base">
                    <Link href={link.href} className="after:absolute after:inset-0">
                      {link.label}
                    </Link>
                  </CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Hint card */}
      <Card>
        <CardContent className="flex items-start gap-3 p-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-aurora shadow-glow">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Try the AI Assistant</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Draft support responses, summarise long tickets, or find information across the
              knowledge base — all from the AI Assistant.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/ai">Open AI Assistant</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
