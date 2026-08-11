"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import {
  CalendarDays,
  Clock,
  Plus,
  Send,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { QUERY_KEYS } from "@/lib/constants";
import {
  applyLeave,
  getLeaveBalance,
  getLeaveRequests,
  type LeaveBalance as LeaveBalanceType,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

const TYPE_LABELS: Record<LeaveType, string> = {
  casual: "Casual",
  sick: "Sick",
  earned: "Earned",
  unpaid: "Unpaid",
};

const STATUS_VARIANT: Record<LeaveStatus, "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
};

const TYPE_COLORS: Record<LeaveType, string> = {
  casual: "bg-emerald-500",
  sick: "bg-rose-500",
  earned: "bg-blue-500",
  unpaid: "bg-amber-500",
};

export default function LeavePage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "casual" as LeaveType,
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const balanceQuery = useQuery({
    queryKey: QUERY_KEYS.leaveBalance,
    queryFn: () => getLeaveBalance(),
  });
  const requestsQuery = useQuery({
    queryKey: QUERY_KEYS.leaveRequests,
    queryFn: () => getLeaveRequests(),
  });

  const applyMutation = useMutation({
    mutationFn: () => Promise.resolve(applyLeave(form)),
    onSuccess: (req) => {
      queryClient.setQueryData<LeaveRequest[]>(
        QUERY_KEYS.leaveRequests,
        (old) => [req, ...(old ?? [])],
      );
      toast.success("Leave request submitted", {
        description: `${TYPE_LABELS[req.type]} leave · ${req.days} day${req.days === 1 ? "" : "s"}`,
      });
      setOpen(false);
      setForm({
        type: "casual",
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: format(new Date(), "yyyy-MM-dd"),
        reason: "",
      });
      setErrors({});
    },
  });

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.startDate) next.startDate = "Start date is required";
    if (!form.endDate) next.endDate = "End date is required";
    if (
      form.startDate &&
      form.endDate &&
      parseISO(form.endDate) < parseISO(form.startDate)
    ) {
      next.endDate = "End date must be on or after start date";
    }
    if (!form.reason.trim()) next.reason = "Reason is required";
    else if (form.reason.trim().length < 5) next.reason = "Please provide a brief reason";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    applyMutation.mutate();
  }

  const balance = balanceQuery.data;
  const pendingCount = (requestsQuery.data ?? []).filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        description="Apply for leave, track balances, and review your leave history."
        icon={CalendarDays}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Apply for leave
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply for leave</DialogTitle>
                <DialogDescription>
                  Submit a new leave request. Your manager will be notified.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="leave-type">Leave type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm((f) => ({ ...f, type: v as LeaveType }))}
                  >
                    <SelectTrigger id="leave-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="leave-start">Start date</Label>
                    <Input
                      id="leave-start"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    />
                    {errors.startDate && (
                      <p className="text-xs text-destructive">{errors.startDate}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="leave-end">End date</Label>
                    <Input
                      id="leave-end"
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    />
                    {errors.endDate && (
                      <p className="text-xs text-destructive">{errors.endDate}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leave-reason">Reason</Label>
                  <Textarea
                    id="leave-reason"
                    rows={3}
                    placeholder="Briefly describe the reason for your leave"
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                  {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.02] p-3 text-xs text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Duration:{" "}
                  <span className="font-medium text-foreground">
                    {Math.max(
                      1,
                      differenceInCalendarDays(parseISO(form.endDate), parseISO(form.startDate)) + 1,
                    )}{" "}
                    day(s)
                  </span>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button type="submit" disabled={applyMutation.isPending}>
                    <Send className="h-4 w-4" />
                    {applyMutation.isPending ? "Submitting…" : "Submit request"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Leave balances */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {balanceQuery.isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
          : balance &&
            (Object.keys(TYPE_LABELS) as LeaveType[]).map((type) => {
              const entry = balance[type as keyof LeaveBalanceType];
              const pct = entry.total ? (entry.used / entry.total) * 100 : 0;
              return (
                <Card key={type}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardDescription className="flex items-center gap-2">
                        <span className={cnDot(TYPE_COLORS[type])} />
                        {TYPE_LABELS[type]}
                      </CardDescription>
                      <Badge variant="outline">
                        {entry.total - entry.used} left
                      </Badge>
                    </div>
                    <CardTitle className="text-3xl">
                      {entry.used}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}
                        / {entry.total}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Progress value={pct} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {pct.toFixed(0)}% used
                    </p>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Pending summary banner */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <Clock className="h-5 w-5 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              You have {pendingCount} pending leave request{pendingCount === 1 ? "" : "s"}.
            </p>
            <p className="text-xs text-muted-foreground">
              Your manager will review and respond shortly.
            </p>
          </div>
        </div>
      )}

      {/* Leave requests table */}
      <Card>
        <CardHeader>
          <CardTitle>Leave requests</CardTitle>
          <CardDescription>
            All your leave applications, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requestsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : requestsQuery.data && requestsQuery.data.length > 0 ? (
            <ScrollArea className="max-h-[28rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Approver</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestsQuery.data.map((req: LeaveRequest) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={cnDot(TYPE_COLORS[req.type])} />
                          {TYPE_LABELS[req.type]}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(req.startDate)}
                          {req.days > 1 && (
                            <>
                              {" → "}
                              {formatDate(req.endDate)}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{req.days}</TableCell>
                      <TableCell className="max-w-xs">
                        <span className="line-clamp-1 text-sm text-muted-foreground">
                          {req.reason}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {req.approver ? req.approver.name : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={STATUS_VARIANT[req.status]}>
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No leave requests yet"
              description="Apply for leave using the button above."
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Apply for leave
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cnDot(color: string): string {
  return `inline-block h-2 w-2 rounded-full ${color}`;
}
