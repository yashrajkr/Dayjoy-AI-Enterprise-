"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  format,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  Play,
  Square,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendanceChart } from "@/components/charts/attendance-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QUERY_KEYS } from "@/lib/constants";
import {
  checkInNow,
  checkOutNow,
  getAttendanceMonth,
  getAttendanceToday,
  summariseAttendance,
  type AttendanceMonthSummary,
  type AttendanceRecord,
  type AttendanceStatus,
  type AttendanceToday as AttendanceTodayType,
} from "@/lib/mock-data";
import { cn, formatHours, formatTime } from "@/lib/utils";

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500",
  late: "bg-amber-500",
  "half-day": "bg-yellow-500",
  leave: "bg-blue-500",
  absent: "bg-rose-500",
  weekend: "bg-white/10",
};

const STATUS_BADGE: Record<AttendanceStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "live" }> = {
  present: { label: "Present", variant: "success" },
  late: { label: "Late", variant: "warning" },
  "half-day": { label: "Half-day", variant: "warning" },
  leave: { label: "On Leave", variant: "live" },
  absent: { label: "Absent", variant: "destructive" },
  weekend: { label: "Weekend", variant: "secondary" },
};

const CHART_DATA_COLORS: { name: string; key: keyof AttendanceMonthSummary; color: string }[] = [
  { name: "Present", key: "present", color: "hsl(156 64% 48%)" },
  { name: "Late", key: "late", color: "hsl(45 93% 58%)" },
  { name: "Half-day", key: "halfDay", color: "hsl(38 92% 50%)" },
  { name: "Leave", key: "leave", color: "hsl(219 100% 65%)" },
  { name: "Absent", key: "absent", color: "hsl(351 83% 64%)" },
  { name: "Weekend", key: "weekend", color: "hsl(230 15% 30%)" },
];

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState<Date>(new Date());
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  // Today's status — refreshes on check-in / check-out mutations.
  const todayQuery = useQuery({
    queryKey: QUERY_KEYS.attendanceToday,
    queryFn: () => getAttendanceToday(),
  });

  // Month history.
  const monthQuery = useQuery({
    queryKey: QUERY_KEYS.attendanceMonth(format(month, "yyyy-MM")),
    queryFn: () => getAttendanceMonth(month),
  });

  const summary = useMemo(() => {
    if (!monthQuery.data) return null;
    return summariseAttendance(monthQuery.data);
  }, [monthQuery.data]);

  const checkInMutation = useMutation({
    mutationFn: () => Promise.resolve(checkInNow()),
    onSuccess: (data) => {
      queryClient.setQueryData<AttendanceTodayType>(QUERY_KEYS.attendanceToday, data);
      toast.success("Checked in", { description: `Check-in time: ${formatTime(data.checkIn)}` });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: () => {
      const today = todayQuery.data;
      if (!today) throw new Error("No attendance record");
      return Promise.resolve(checkOutNow(today));
    },
    onSuccess: (data) => {
      queryClient.setQueryData<AttendanceTodayType>(QUERY_KEYS.attendanceToday, data);
      toast.success("Checked out", { description: `Hours worked: ${formatHours(data.hoursWorked)}` });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.attendanceMonth(format(month, "yyyy-MM")) });
    },
  });

  const today = todayQuery.data;
  const isCheckedIn = !!today?.checkIn;
  const isCheckedOut = !!today?.checkOut;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Track your daily attendance, hours worked, and monthly summary."
        icon={CalendarClock}
        actions={
          <Button variant="outline" size="sm" onClick={() => setMonth(new Date())}>
            Today
          </Button>
        }
      />

      {/* Today + check-in / check-out */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {todayQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatTile
                    icon={<LogIn className="h-4 w-4" />}
                    label="Check-in"
                    value={today?.checkIn ? formatTime(today.checkIn) : "—"}
                    hint={isCheckedIn ? "Recorded" : "Not checked in"}
                  />
                  <StatTile
                    icon={<LogOut className="h-4 w-4" />}
                    label="Check-out"
                    value={today?.checkOut ? formatTime(today.checkOut) : "—"}
                    hint={isCheckedOut ? "Recorded" : "Pending"}
                  />
                  <StatTile
                    icon={<Clock className="h-4 w-4" />}
                    label="Hours worked"
                    value={formatHours(today?.hoursWorked ?? 0)}
                    hint={today?.status && today.status !== "not-checked-in" ? STATUS_BADGE[today.status].label : "—"}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {!isCheckedIn && (
                    <Button
                      onClick={() => checkInMutation.mutate()}
                      disabled={checkInMutation.isPending}
                    >
                      <Play className="h-4 w-4" />
                      {checkInMutation.isPending ? "Checking in…" : "Check in"}
                    </Button>
                  )}
                  {isCheckedIn && !isCheckedOut && (
                    <Button
                      variant="destructive"
                      onClick={() => checkOutMutation.mutate()}
                      disabled={checkOutMutation.isPending}
                    >
                      <Square className="h-4 w-4" />
                      {checkOutMutation.isPending ? "Checking out…" : "Check out"}
                    </Button>
                  )}
                  {isCheckedOut && (
                    <Badge variant="success" dot>
                      Day complete
                    </Badge>
                  )}
                  {isCheckedIn && !isCheckedOut && today?.status === "late" && (
                    <Badge variant="warning">Late check-in</Badge>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Monthly summary donut */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly summary</CardTitle>
            <CardDescription>{format(month, "MMMM yyyy")}</CardDescription>
          </CardHeader>
          <CardContent>
            {!summary ? (
              <Skeleton className="h-[240px] w-full rounded-xl" />
            ) : (
              <AttendanceChart
                data={CHART_DATA_COLORS.map((s) => ({
                  name: s.name,
                  value: summary[s.key],
                  color: s.color,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryStat label="Present" value={summary?.present ?? 0} color="text-emerald-500" />
        <SummaryStat label="Late" value={summary?.late ?? 0} color="text-amber-500" />
        <SummaryStat label="Half-day" value={summary?.halfDay ?? 0} color="text-yellow-500" />
        <SummaryStat label="Leave" value={summary?.leave ?? 0} color="text-blue-500" />
        <SummaryStat label="Absent" value={summary?.absent ?? 0} color="text-rose-500" />
        <SummaryStat
          label="Total hours"
          value={formatHours(summary?.totalHours ?? 0)}
          color="text-cyan"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Calendar + history */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>
              Tap a day to inspect its record. Colored dots indicate status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              month={month}
              onMonthChange={setMonth}
              selected={selected}
              onSelect={setSelected}
              renderDay={(day) => {
                const rec = monthQuery.data?.find((r) =>
                  isSameDay(parseISO(r.date), day),
                );
                if (!rec || rec.status === "weekend") return null;
                return (
                  <span
                    className={cn(
                      "mt-0.5 h-1 w-1 rounded-full",
                      STATUS_COLORS[rec.status as AttendanceStatus],
                    )}
                  />
                );
              }}
            />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
              {CHART_DATA_COLORS.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>
              Attendance records for {format(month, "MMMM yyyy")}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {monthQuery.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : monthQuery.data && monthQuery.data.length > 0 ? (
              <ScrollArea className="max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...monthQuery.data]
                      .filter((r) => r.status !== "weekend")
                      .reverse()
                      .map((rec: AttendanceRecord) => {
                        const badge = STATUS_BADGE[rec.status as AttendanceStatus];
                        return (
                          <TableRow key={rec.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span>{format(parseISO(rec.date), "MMM d")}</span>
                                {isToday(parseISO(rec.date)) && (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-cyan" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{rec.checkIn ? formatTime(rec.checkIn) : "—"}</TableCell>
                            <TableCell>{rec.checkOut ? formatTime(rec.checkOut) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {rec.hoursWorked ? formatHours(rec.hoursWorked) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="No attendance records"
                description={`No records yet for ${format(month, "MMMM yyyy")}.`}
              />
            )}
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
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", color)}>{value}</div>
    </Card>
  );
}
