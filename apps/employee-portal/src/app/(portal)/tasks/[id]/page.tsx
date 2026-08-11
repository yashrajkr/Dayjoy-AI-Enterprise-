"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useTask } from "@/hooks/use-tasks";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getStatusColor,
  getInitials,
  isOverdue,
  isToday,
} from "@/lib/utils";

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { task, isLoading, isError, updateTask, completeTask, addComment, logTime } =
    useTask(params.id);

  const [comment, setComment] = useState("");
  const [minutes, setMinutes] = useState("");
  const [timeNote, setTimeNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Task" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  if (isError || !task) {
    return (
      <EmptyState
        title="Task not found"
        description="This task may have been deleted."
        action={
          <Button asChild size="sm">
            <Link href="/tasks">Back to tasks</Link>
          </Button>
        }
      />
    );
  }

  const overdue =
    task.dueDate &&
    isOverdue(task.dueDate) &&
    !isToday(task.dueDate) &&
    task.status !== "DONE";

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await addComment(comment.trim());
      setComment("");
      toast.success("Comment added");
    } catch {
      toast.error("Could not add comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogTime = async () => {
    const mins = Number(minutes);
    if (!mins || mins <= 0) return;
    setSubmitting(true);
    try {
      await logTime(mins, timeNote || undefined);
      setMinutes("");
      setTimeNote("");
      toast.success(`Logged ${mins} minutes`);
    } catch {
      toast.error("Could not log time");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (status: typeof task.status) => {
    try {
      await updateTask({ status });
      toast.success(`Status: ${TASK_STATUS_LABELS[status]}`);
    } catch {
      toast.error("Could not update status");
    }
  };

  const handleComplete = async () => {
    try {
      await completeTask();
      router.refresh();
    } catch {
      toast.error("Could not complete task");
    }
  };

  return (
    <>
      <PageHeader
        title={task.title}
        description={
          task.relatedEntity
            ? `Related ${task.relatedEntity.type.toLowerCase()}: ${task.relatedEntity.label ?? task.relatedEntity.id}`
            : "Task detail"
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/tasks">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
            {task.status !== "DONE" && (
              <Button size="sm" onClick={handleComplete}>
                <CheckCircle2 className="h-4 w-4" /> Mark complete
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left — task info + description */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>
                Created {formatRelativeTime(task.createdAt)}
                {task.assignedByName && ` · Assigned by ${task.assignedByName}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(getStatusColor(task.status))}
                >
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(getStatusColor(task.priority))}
                >
                  {TASK_PRIORITY_LABELS[task.priority]} priority
                </Badge>
                {task.type && (
                  <Badge variant="secondary" className="text-xs">
                    {task.type.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                )}
              </div>

              {task.description && (
                <div className="rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed">
                  {task.description}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Due date
                  </p>
                  <p
                    className={cn(
                      "mt-1 inline-flex items-center gap-1",
                      overdue
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-foreground",
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {task.dueDate ? formatDate(task.dueDate) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Assigned to
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={task.assignedToAvatarUrl} alt={task.assignedToName} />
                      <AvatarFallback className="text-[10px]">
                        {getInitials(task.assignedToName)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{task.assignedToName}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Time logged
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatMinutes(task.totalMinutesLogged ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const).map(
                      (s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-xs transition-colors",
                            task.status === s
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {TASK_STATUS_LABELS[s]}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subtasks */}
          <Card>
            <CardHeader>
              <CardTitle>Subtasks</CardTitle>
              <CardDescription>
                {task.subtasks?.filter((s) => s.done).length ?? 0}/
                {task.subtasks?.length ?? 0} complete
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {task.subtasks && task.subtasks.length > 0 ? (
                task.subtasks.map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center gap-2 rounded-md border border-border p-2"
                  >
                    <CheckCircle2
                      className={cn(
                        "h-4 w-4",
                        st.done
                          ? "text-emerald-500"
                          : "text-muted-foreground",
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm",
                        st.done && "text-muted-foreground line-through",
                      )}
                    >
                      {st.title}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No subtasks yet.
                </p>
              )}
              <Button variant="ghost" size="sm" className="w-full justify-start">
                <Plus className="h-3.5 w-3.5" /> Add subtask
              </Button>
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Comments
              </CardTitle>
              <CardDescription>
                Discussion thread on this task.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {task.comments && task.comments.length > 0 ? (
                task.comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={c.authorAvatarUrl} alt={c.authorName} />
                      <AvatarFallback className="text-[10px]">
                        {getInitials(c.authorName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{c.authorName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(c.createdAt)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-foreground">{c.body}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No comments yet — start the conversation.
                </p>
              )}
              <Separator />
              <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    <UserCircle2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment…"
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={!comment.trim() || submitting}
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Comment
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right — time tracking + activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Log time
              </CardTitle>
              <CardDescription>
                Track how long you spent on this task.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-semibold">
                  {formatMinutes(task.totalMinutesLogged ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">total logged</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minutes">Minutes</Label>
                <Input
                  id="minutes"
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="e.g. 30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeNote">Note (optional)</Label>
                <Input
                  id="timeNote"
                  value={timeNote}
                  onChange={(e) => setTimeNote(e.target.value)}
                  placeholder="What did you do?"
                />
              </div>
              <Button
                onClick={handleLogTime}
                disabled={!minutes || submitting}
                className="w-full"
                size="sm"
              >
                Log time
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Time logs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {task.timeLogs && task.timeLogs.length > 0 ? (
                task.timeLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border border-border p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{log.employeeName}</span>
                      <Badge variant="secondary">{log.minutes}m</Badge>
                    </div>
                    {log.note && (
                      <p className="mt-1 text-muted-foreground">{log.note}</p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDateTime(log.loggedAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No time logged.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
