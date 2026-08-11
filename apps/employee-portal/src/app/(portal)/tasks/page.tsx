"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Filter,
  KanbanSquare,
  ListFilter,
  Plus,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTasks } from "@/hooks/use-tasks";
import { useTaskFiltersStore } from "@/store/task-filters.store";
import { useDebounce } from "@/hooks/use-debounce";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import type {
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/task.types";
import {
  cn,
  formatDate,
  formatRelativeTime,
  getStatusColor,
  isOverdue,
  isToday,
} from "@/lib/utils";

const STATUS_OPTIONS: (TaskStatus | "ALL")[] = [
  "ALL",
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "BLOCKED",
];

const PRIORITY_OPTIONS: (TaskPriority | "ALL")[] = [
  "ALL",
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
];

const DUE_OPTIONS = ["ALL", "TODAY", "OVERDUE", "THIS_WEEK"] as const;

const KANBAN_COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "TODO", label: "To Do", accent: "border-t-slate-400" },
  { status: "IN_PROGRESS", label: "In Progress", accent: "border-t-sky-500" },
  { status: "BLOCKED", label: "Blocked", accent: "border-t-amber-500" },
  { status: "DONE", label: "Done", accent: "border-t-emerald-500" },
];

export default function TasksPage() {
  const { tasks, isLoading, isError } = useTasks();
  const filters = useTaskFiltersStore();
  const [search, setSearch] = useState(filters.search ?? "");
  const debouncedSearch = useDebounce(search, 300);

  // Sync debounced search into the store
  useMemo(() => {
    if (debouncedSearch !== filters.search) {
      filters.setSearch(debouncedSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.status !== "ALL" && t.status !== filters.status) return false;
      if (filters.priority !== "ALL" && t.priority !== filters.priority)
        return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !(t.description ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      if (filters.dueDate && filters.dueDate !== "ALL" && t.dueDate) {
        const overdue = isOverdue(t.dueDate) && !isToday(t.dueDate);
        if (filters.dueDate === "TODAY" && !isToday(t.dueDate)) return false;
        if (filters.dueDate === "OVERDUE" && !overdue) return false;
        if (filters.dueDate === "THIS_WEEK") {
          const d = new Date(t.dueDate);
          const now = new Date();
          const days = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          if (days < 0 || days > 7) return false;
        }
      }
      return true;
    });
  }, [tasks, filters.status, filters.priority, filters.search, filters.dueDate]);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Your tasks for today and beyond. Filter, prioritise, and ship."
        actions={
          <Button asChild size="sm">
            <Link href="/tasks/new">
              <Plus className="h-4 w-4" /> New task
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks by title or description…"
              className="pl-9"
              aria-label="Search tasks"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={filters.status ?? "ALL"}
              onValueChange={(v) => filters.setStatus(v as TaskStatus | "ALL")}
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.priority ?? "ALL"}
              onValueChange={(v) =>
                filters.setPriority(v as TaskPriority | "ALL")
              }
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.dueDate ?? "ALL"}
              onValueChange={(v) =>
                filters.setDueDate(v as (typeof DUE_OPTIONS)[number])
              }
            >
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Due date" />
              </SelectTrigger>
              <SelectContent>
                {DUE_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d === "ALL"
                      ? "All due dates"
                      : d === "TODAY"
                        ? "Due today"
                        : d === "OVERDUE"
                          ? "Overdue"
                          : "This week"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs
              value={filters.view ?? "TABLE"}
              onValueChange={(v) =>
                filters.setView(v as "TABLE" | "KANBAN")
              }
            >
              <TabsList className="h-9">
                <TabsTrigger value="TABLE" className="gap-1">
                  <ListFilter className="h-3.5 w-3.5" /> Table
                </TabsTrigger>
                <TabsTrigger value="KANBAN" className="gap-1">
                  <KanbanSquare className="h-3.5 w-3.5" /> Kanban
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <EmptyState
          title="Couldn't load tasks"
          description="Please try again in a moment."
        />
      ) : isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No tasks match your filters"
          description="Try clearing filters or create a new task."
          action={
            <Button asChild size="sm">
              <Link href="/tasks/new">New task</Link>
            </Button>
          }
        />
      ) : filters.view === "KANBAN" ? (
        <KanbanView tasks={filtered} />
      ) : (
        <TableView tasks={filtered} />
      )}
    </>
  );
}

function TableView({ tasks }: { tasks: Task[] }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead className="w-[110px]">Priority</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
            <TableHead className="w-[140px]">Due</TableHead>
            <TableHead className="w-[160px]">Assigned by</TableHead>
            <TableHead className="w-[100px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const overdue =
              task.dueDate &&
              isOverdue(task.dueDate) &&
              !isToday(task.dueDate) &&
              task.status !== "DONE";
            return (
              <TableRow key={task.id}>
                <TableCell>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="block max-w-md truncate text-sm font-medium text-foreground hover:text-primary"
                  >
                    {task.title}
                  </Link>
                  {task.relatedEntity && (
                    <span className="text-xs text-muted-foreground">
                      {task.relatedEntity.type}: {task.relatedEntity.label}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(getStatusColor(task.priority))}
                  >
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(getStatusColor(task.status))}
                  >
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs",
                      overdue
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground",
                    )}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {task.dueDate ? formatDate(task.dueDate) : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {task.assignedByName ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/tasks/${task.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function KanbanView({ tasks }: { tasks: Task[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KANBAN_COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.status);
        return (
          <Card
            key={col.status}
            className={cn("flex flex-col border-t-4", col.accent)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {col.label}
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {columnTasks.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-2 p-3 pt-0">
              {columnTasks.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Nothing here.
                </p>
              ) : (
                columnTasks.map((task) => {
                  const overdue =
                    task.dueDate &&
                    isOverdue(task.dueDate) &&
                    !isToday(task.dueDate) &&
                    task.status !== "DONE";
                  return (
                    <Link
                      key={task.id}
                      href={`/tasks/${task.id}`}
                      className="block rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                    >
                      <p className="text-sm font-medium leading-snug">
                        {task.title}
                      </p>
                      {task.relatedEntity && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {task.relatedEntity.type}: {task.relatedEntity.label}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            getStatusColor(task.priority),
                          )}
                        >
                          {TASK_PRIORITY_LABELS[task.priority]}
                        </Badge>
                        {task.dueDate && (
                          <span
                            className={cn(
                              "text-[11px]",
                              overdue
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatRelativeTime(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
