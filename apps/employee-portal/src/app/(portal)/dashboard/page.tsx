"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Megaphone,
  Plus,
  Search,
  TicketIcon,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEmployee } from "@/hooks/use-employee";
import { useDashboard } from "@/hooks/use-dashboard";
import {
  cn,
  formatRelativeTime,
  getStatusColor,
  isOverdue,
  isToday,
} from "@/lib/utils";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import type { TaskPriority, TaskStatus } from "@/types/task.types";

export default function DashboardPage() {
  const { employee } = useEmployee();
  const { data, isLoading } = useDashboard();

  const greeting = getGreeting();
  const firstName = employee?.firstName ?? "there";
  const roleLabel = employee?.role
    ? employee.role.replace(/_/g, " ").toLowerCase()
    : "employee";
  const departmentLabel = employee?.department
    ? employee.department.replace(/_/g, " ").toLowerCase()
    : null;

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}.`}
        description={
          departmentLabel
            ? `You're signed in as ${roleLabel} in ${departmentLabel}. Here's your day at a glance.`
            : `You're signed in as ${roleLabel}. Here's your day at a glance.`
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/crm/customers">
                <Search className="h-4 w-4" /> Search customer
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/tickets/new">
                <Plus className="h-4 w-4" /> New ticket
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/tasks/new">
                <Plus className="h-4 w-4" /> New task
              </Link>
            </Button>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <KpiCard
            label="My open tasks"
            value={data?.kpis.myOpenTasks ?? 0}
            icon={CheckCircle2}
            href="/tasks"
            sub={`${data?.kpis.tasksCompletedThisWeek ?? 0} done this week`}
            accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          />
        )}
        {isLoading ? null : (
          <KpiCard
            label="My open tickets"
            value={data?.kpis.myOpenTickets ?? 0}
            icon={TicketIcon}
            href="/tickets"
            sub={`avg first response ${data?.kpis.avgFirstResponseTimeMins ?? 0}m`}
            accent="bg-rose-500/10 text-rose-600 dark:text-rose-400"
          />
        )}
        {isLoading ? null : (
          <KpiCard
            label="Leads today"
            value={data?.kpis.leadsToday ?? 0}
            icon={TrendingUp}
            href="/crm/leads"
            sub="across all sources"
            accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
        )}
        {isLoading ? null : (
          <KpiCard
            label="Customers managed"
            value={data?.kpis.customersManaged ?? 0}
            icon={Users}
            href="/crm/customers"
            sub="in your book"
            accent="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          />
        )}
      </div>

      {/* Main grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Today's tasks */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Today&apos;s tasks</CardTitle>
              <CardDescription>What needs to get done today.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/tasks">
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : data && data.tasksToday.length > 0 ? (
              <ul className="divide-y divide-border">
                {data.tasksToday.map((task) => {
                  const overdue = isOverdue(task.dueDate) && !isToday(task.dueDate);
                  return (
                    <li key={task.id}>
                      <Link
                        href={`/tasks/${task.id}`}
                        className="flex items-center gap-3 py-3 transition-colors hover:bg-accent/40"
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                            task.status === "DONE"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {task.status === "DONE" ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            task.title.charAt(0)
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm font-medium",
                              task.status === "DONE" &&
                                "text-muted-foreground line-through",
                            )}
                          >
                            {task.title}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {task.relatedTo && (
                              <span className="rounded-sm bg-muted px-1.5 py-0.5">
                                {task.relatedTo.type}: {task.relatedTo.label}
                              </span>
                            )}
                            <span
                              className={cn(
                                "inline-flex items-center gap-1",
                                overdue && "text-rose-600 dark:text-rose-400",
                              )}
                            >
                              <Clock className="h-3 w-3" />
                              {isToday(task.dueDate)
                                ? "Due today"
                                : `Overdue · ${formatRelativeTime(task.dueDate)}`}
                            </span>
                          </div>
                        </div>
                        <Badge
                          className={cn(
                            "shrink-0",
                            getStatusColor(task.priority),
                          )}
                          variant="outline"
                        >
                          {TASK_PRIORITY_LABELS[task.priority]}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="No tasks due today"
                description="Enjoy the breather — or pick up a backlog item."
                action={
                  <Button asChild size="sm">
                    <Link href="/tasks/new">Add a task</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* AI quick access */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> AI Assistant
            </CardTitle>
            <CardDescription>
              Skip the busywork. Ask the assistant to draft, summarise, or
              look up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {AI_QUICK_ACTIONS.map((a) => (
              <Button
                key={a.label}
                asChild
                variant="outline"
                className="h-auto justify-start py-2.5 text-left"
              >
                <Link href={`/ai-assistant?prompt=${encodeURIComponent(a.prompt)}`}>
                  <a.icon className="mr-2 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-xs leading-snug">{a.label}</span>
                </Link>
              </Button>
            ))}
            <Button asChild className="mt-2 w-full">
              <Link href="/ai-assistant">
                <Bot className="h-4 w-4" /> Open AI Assistant
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Second row: recent tickets, activity, weekly chart */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent tickets</CardTitle>
              <CardDescription>Assigned to you or your team.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/tickets">
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : data && data.recentTickets.length > 0 ? (
              <ul className="divide-y divide-border">
                {data.recentTickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tickets/${t.id}`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-accent/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          <span className="font-mono text-xs text-muted-foreground">
                            {t.number}
                          </span>{" "}
                          {t.subject}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.customerName} · {formatRelativeTime(t.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0", getStatusColor(t.priority))}
                      >
                        {TASK_PRIORITY_LABELS[t.priority as TaskPriority]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0", getStatusColor(t.status))}
                      >
                        {t.status.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={TicketIcon}
                title="No tickets assigned to you"
                description="You're all caught up."
              />
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Recent activity
            </CardTitle>
            <CardDescription>What you&apos;ve been up to.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : data && data.recentActivity.length > 0 ? (
              <ScrollArea className="max-h-72">
                <ol className="space-y-4">
                  {data.recentActivity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm text-foreground">
                          {a.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(a.timestamp)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            ) : (
              <EmptyState
                icon={Activity}
                title="No recent activity"
                description="Start working and your activity will show up here."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Weekly tasks chart + announcements */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>This week&apos;s tasks</CardTitle>
            <CardDescription>
              Completed vs created, last 7 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data?.weeklyTasks ?? []}
                    margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="created"
                      name="Created"
                      stroke="#f97316"
                      fill="url(#gCreated)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      name="Completed"
                      stroke="#10b981"
                      fill="url(#gComp)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" /> Team announcements
            </CardTitle>
            <CardDescription>From your team leads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : data && data.announcements.length > 0 ? (
              data.announcements.map((ann) => (
                <motion.div
                  key={ann.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-border bg-card/60 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{ann.title}</p>
                    {ann.priority && ann.priority === "HIGH" && (
                      <Badge variant="destructive" className="shrink-0 text-[10px]">
                        High
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {ann.body}
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {ann.authorName} · {formatRelativeTime(ann.publishedAt)}
                  </p>
                </motion.div>
              ))
            ) : (
              <EmptyState
                icon={Bell}
                title="No announcements"
                description="Team announcements will appear here."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ===== Local components =====

function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  sub,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  href: string;
  sub?: string;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </CardTitle>
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              accent,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <Button
            asChild
            variant="link"
            size="sm"
            className="mt-1 h-auto p-0 text-xs"
          >
            <Link href={href}>
              View <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const AI_QUICK_ACTIONS = [
  {
    label: "Summarise my open tickets",
    prompt: "Summarise my open tickets",
    icon: TicketIcon,
  },
  {
    label: "Draft a reply to TKT-4821",
    prompt: "Draft a reply to ticket TKT-4821",
    icon: Activity,
  },
  {
    label: "Find product info for Wellness Bundle",
    prompt: "Find product info for Wellness Bundle",
    icon: Search,
  },
  {
    label: "Generate a weekly activity report",
    prompt: "Generate a weekly activity report",
    icon: TrendingUp,
  },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Re-export for type usage in this file
export type { TaskStatus };
