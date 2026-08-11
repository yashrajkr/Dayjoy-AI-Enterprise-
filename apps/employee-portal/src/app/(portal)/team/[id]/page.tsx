"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  UsersRound,
  Mail,
  Phone,
  MapPin,
  CalendarClock,
  Briefcase,
  Building2,
  ListTodo,
  Ticket as TicketIcon,
  TrendingUp,
  Activity,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QUERY_KEYS } from "@/lib/constants";
import {
  getTeamMember,
  getTeamMemberActivity,
  type TeamMemberActivity,
} from "@/lib/mock-data";
import { cn, formatDate, getInitials } from "@/lib/utils";

const ACTIVITY_ICONS = {
  task: ListTodo,
  ticket: TicketIcon,
  lead: TrendingUp,
  customer: UsersRound,
  attendance: CalendarClock,
  note: Activity,
} as const;

const ACTIVITY_COLORS = {
  task: "text-emerald-500 bg-emerald-500/10",
  ticket: "text-cyan bg-cyan/10",
  lead: "text-indigo bg-indigo/10",
  customer: "text-amber-500 bg-amber-500/10",
  attendance: "text-blue-500 bg-blue-500/10",
  note: "text-muted-foreground bg-white/[0.05]",
} as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TeamMemberDetailPage({ params }: PageProps) {
  const { id } = use(params);

  const memberQuery = useQuery({
    queryKey: QUERY_KEYS.teamMember(id),
    queryFn: () => getTeamMember(id),
  });
  const activityQuery = useQuery({
    queryKey: [...QUERY_KEYS.teamMember(id), "activity"],
    queryFn: () => getTeamMemberActivity(id),
  });

  const member = memberQuery.data;

  if (memberQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <UsersRound className="h-10 w-10 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Member not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The team member you're looking for doesn't exist or you don't have access.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/team">
            <ArrowLeft className="h-4 w-4" />
            Back to team
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={member.name}
        description={`${member.role} · ${member.department}`}
        icon={UsersRound}
        actions={
          <Button asChild variant="outline">
            <Link href="/team">
              <ArrowLeft className="h-4 w-4" />
              Back to team
            </Link>
          </Button>
        }
      />

      {/* Profile card */}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20">
            <AvatarFallback className={cn("text-xl font-semibold text-white", member.avatarColor)}>
              {getInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{member.name}</h2>
              <Badge variant="outline">{member.role}</Badge>
              <Badge
                variant={member.status === "active" ? "success" : member.status === "on-leave" ? "warning" : "secondary"}
                dot
              >
                {member.status.replace("-", " ")}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {member.email}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {member.phone}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {member.location}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Joined {formatDate(member.joinDate)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={<Briefcase className="h-4 w-4" />} label="Department" value={member.department} />
        <StatTile icon={<ListTodo className="h-4 w-4" />} label="Active tasks" value={String(member.activeTasks)} />
        <StatTile icon={<TicketIcon className="h-4 w-4" />} label="Open tickets" value={String(member.openTickets)} />
        <StatTile icon={<Clock className="h-4 w-4" />} label="Shift" value={member.shift} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Performance
            </CardTitle>
            <CardDescription>Current performance score.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center text-center">
              <div className="text-4xl font-semibold text-foreground">{member.performance}%</div>
              <Progress value={member.performance} className="mt-3 w-full" />
              <p className="mt-2 text-xs text-muted-foreground">
                {member.performance >= 90
                  ? "Excellent — top performer"
                  : member.performance >= 80
                    ? "Strong — meeting expectations"
                    : "Below expectations — needs improvement"}
              </p>
            </div>
            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tasks completed (30d)</span>
                <span className="font-medium">{Math.round(member.performance * 0.5)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tickets resolved (30d)</span>
                <span className="font-medium">{Math.round(member.performance * 0.35)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg CSAT (30d)</span>
                <span className="font-medium">{(3 + (member.performance / 100) * 2).toFixed(1)} / 5</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Attendance (30d)
            </CardTitle>
            <CardDescription>Recent attendance summary.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <AttendanceTile label="Present" value="22" color="text-emerald-500" />
              <AttendanceTile label="Late" value="3" color="text-amber-500" />
              <AttendanceTile label="Leave" value="2" color="text-blue-500" />
              <AttendanceTile label="Absent" value="0" color="text-rose-500" />
            </div>
            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg check-in</span>
                <span className="font-medium">9:14 AM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg hours/day</span>
                <span className="font-medium">8.2h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total hours (30d)</span>
                <span className="font-medium">180.4h</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Activity
            </CardTitle>
            <CardDescription>Recent activity timeline.</CardDescription>
          </CardHeader>
          <CardContent>
            {activityQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <ScrollArea className="max-h-72">
                <ol className="relative space-y-4 before:absolute before:left-4 before:top-2 before:h-full before:w-px before:bg-border">
                  {(activityQuery.data ?? []).map((act: TeamMemberActivity) => {
                    const Icon = ACTIVITY_ICONS[act.type];
                    return (
                      <li key={act.id} className="relative flex gap-3 pl-0">
                        <span
                          className={cn(
                            "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            ACTIVITY_COLORS[act.type],
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="flex-1 pt-0.5">
                          <p className="text-sm font-medium text-foreground">{act.title}</p>
                          <p className="text-xs text-muted-foreground">{act.description}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                            {format(parseISO(act.timestamp), "MMM d, yyyy · h:mm a")}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assigned tasks + tickets */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-4 w-4" /> Assigned tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { id: "TSK-301", title: "Update CRM import script", priority: "high", due: "Today" },
                  { id: "TSK-302", title: "Review Q3 sales report", priority: "medium", due: "Tomorrow" },
                  { id: "TSK-303", title: "Onboard new customer", priority: "low", due: "Aug 12" },
                  { id: "TSK-304", title: "Sync Shopify catalog", priority: "urgent", due: "Today" },
                ].map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] text-muted-foreground">{t.id}</span>
                        <span className="text-sm">{t.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.priority === "urgent"
                            ? "default"
                            : t.priority === "high"
                              ? "destructive"
                              : t.priority === "medium"
                                ? "warning"
                                : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {t.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{t.due}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TicketIcon className="h-4 w-4" /> Assigned tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { id: "TKT-5012", subject: "Login MFA loop on iOS", status: "open" },
                  { id: "TKT-5018", subject: "WhatsApp template rejected", status: "in-progress" },
                  { id: "TKT-5021", subject: "CRM sync error with Shopify", status: "open" },
                  { id: "TKT-5029", subject: "Knowledge search stale", status: "resolved" },
                ].map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.id}</TableCell>
                    <TableCell className="text-sm">{t.subject}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          t.status === "resolved"
                            ? "success"
                            : t.status === "in-progress"
                              ? "live"
                              : "warning"
                        }
                        className="text-[10px]"
                      >
                        {t.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-base font-medium text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function AttendanceTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white/[0.02] p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-xl font-semibold tabular-nums", color)}>{value}</div>
    </div>
  );
}
