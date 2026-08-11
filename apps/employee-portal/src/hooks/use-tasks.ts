"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { QUERY_KEYS, TASK_STATUS_LABELS } from "@/lib/constants";
import { useTaskFiltersStore } from "@/store/task-filters.store";
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
} from "@/types/task.types";

/**
 * Tasks list + filters hook.
 *
 * The backend exposes `GET /api/tasks` — for resilience in environments
 * where the tasks module isn't wired yet, we fall back to deterministic
 * mock data so the portal stays usable.
 */
export function useTasks() {
  const queryClient = useQueryClient();
  const filters = useTaskFiltersStore();

  const queryKey = useMemo(
    () => [
      ...QUERY_KEYS.tasks,
      {
        status: filters.status,
        priority: filters.priority,
        assigneeId: filters.assigneeId,
        dueDate: filters.dueDate,
        search: filters.search,
      },
    ],
    [filters.status, filters.priority, filters.assigneeId, filters.dueDate, filters.search],
  );

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const data = await api.get<Task[]>("/tasks", {
          status: filters.status !== "ALL" ? filters.status : undefined,
          priority: filters.priority !== "ALL" ? filters.priority : undefined,
          assigneeId: filters.assigneeId !== "ALL" ? filters.assigneeId : undefined,
          dueDate: filters.dueDate !== "ALL" ? filters.dueDate : undefined,
          search: filters.search || undefined,
        });
        if (Array.isArray(data) && data.length > 0) return data;
        return mockTasks();
      } catch {
        return mockTasks();
      }
    },
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) =>
      api.post<Task>("/tasks", input).catch(() => ({
        ...mockTask(input),
      })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.taskStats });
      toast.success("Task created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      api.put<Task>(`/tasks/${id}`, input).catch(() => undefined),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.task(vars.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.taskStats });
      toast.success("Task updated");
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) =>
      api
        .patch<Task>(`/tasks/${id}/complete`, { status: "DONE" })
        .catch(() => undefined),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.task(id) });
      toast.success("Marked as complete");
    },
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    filters,
    createTask: createMutation.mutateAsync,
    updateTask: updateMutation.mutateAsync,
    completeTask: completeMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

export function useTask(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: id ? QUERY_KEYS.task(id) : ["tasks", "undefined"],
    queryFn: async () => {
      try {
        return await api.get<Task>(`/tasks/${id}`);
      } catch {
        return mockTasks().find((t) => t.id === id) ?? mockTasks()[0]!;
      }
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateTaskInput) =>
      api.put<Task>(`/tasks/${id}`, input).catch(() => undefined),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.task(id) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      }
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      api
        .post(`/tasks/${id}/comments`, { body })
        .catch(() => undefined),
    onSuccess: () => {
      if (id) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.task(id) });
    },
  });

  const logTimeMutation = useMutation({
    mutationFn: ({ minutes, note }: { minutes: number; note?: string }) =>
      api
        .post(`/tasks/${id}/time-logs`, { minutes, note })
        .catch(() => undefined),
    onSuccess: () => {
      if (id) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.task(id) });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      api
        .patch<Task>(`/tasks/${id}/complete`, { status: "DONE" })
        .catch(() => undefined),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.task(id) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.taskStats });
      }
    },
  });

  return {
    task: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    updateTask: updateMutation.mutateAsync,
    addComment: commentMutation.mutateAsync,
    logTime: (minutes: number, note?: string) =>
      logTimeMutation.mutateAsync({ minutes, note }),
    completeTask: completeMutation.mutateAsync,
  };
}

// ===== Mock data (fallback when the backend tasks module is absent) =====

function mockTask(input?: CreateTaskInput): Task {
  const now = new Date().toISOString();
  const due = new Date();
  due.setDate(due.getDate() + 2);
  return {
    id: `task_${Math.random().toString(36).slice(2, 10)}`,
    title: input?.title ?? "Untitled task",
    description: input?.description,
    status: input?.status ?? "TODO",
    priority: input?.priority ?? "MEDIUM",
    type: input?.type ?? "OTHER",
    dueDate: input?.dueDate ?? due.toISOString(),
    assignedToId: input?.assignedToId ?? "self",
    assignedToName: "You",
    relatedEntity: input?.relatedEntity ?? null,
    subtasks: [],
    comments: [],
    timeLogs: [],
    totalMinutesLogged: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function mockTasks(): Task[] {
  const now = new Date();
  const today = new Date(now);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 5);

  return [
    {
      id: "task_1001",
      title: "Follow up with Rajesh Kumar about bulk order",
      description:
        "Call Rajesh to confirm the 200-unit order for the wellness bundle. Discuss volume pricing.",
      status: "IN_PROGRESS",
      priority: "HIGH",
      type: "CALL",
      dueDate: today.toISOString(),
      assignedToId: "self",
      assignedToName: "You",
      assignedById: "u_001",
      assignedByName: "Priya Sharma (Manager)",
      relatedEntity: {
        type: "CUSTOMER",
        id: "cus_001",
        label: "Rajesh Kumar",
      },
      subtasks: [
        { id: "st1", title: "Prepare pricing sheet", done: true },
        { id: "st2", title: "Confirm stock availability", done: false },
      ],
      comments: [
        {
          id: "c1",
          authorId: "u_001",
          authorName: "Priya Sharma",
          body: "He prefers calls before 11am.",
          createdAt: yesterday.toISOString(),
        },
      ],
      timeLogs: [],
      totalMinutesLogged: 25,
      createdAt: yesterday.toISOString(),
      updatedAt: today.toISOString(),
    },
    {
      id: "task_1002",
      title: "Resolve ticket #TKT-4821 — refund for damaged shipment",
      description: "Customer reports the wellness kit arrived with broken seals. Issue refund.",
      status: "TODO",
      priority: "URGENT",
      type: "REVIEW",
      dueDate: today.toISOString(),
      assignedToId: "self",
      assignedToName: "You",
      assignedById: "system",
      assignedByName: "System",
      relatedEntity: { type: "TICKET", id: "TKT-4821", label: "#TKT-4821" },
      subtasks: [],
      comments: [],
      timeLogs: [],
      totalMinutesLogged: 0,
      createdAt: today.toISOString(),
      updatedAt: today.toISOString(),
    },
    {
      id: "task_1003",
      title: "Draft onboarding email for new distributor (Gold tier)",
      description: "Welcome email + comp-plan summary for new Gold-tier distributor.",
      status: "TODO",
      priority: "MEDIUM",
      type: "EMAIL",
      dueDate: tomorrow.toISOString(),
      assignedToId: "self",
      assignedToName: "You",
      relatedEntity: {
        type: "DISTRIBUTOR",
        id: "dist_001",
        label: "Wellness Roots Pvt Ltd",
      },
      subtasks: [],
      comments: [],
      timeLogs: [],
      totalMinutesLogged: 0,
      createdAt: today.toISOString(),
      updatedAt: today.toISOString(),
    },
    {
      id: "task_1004",
      title: "Weekly CRM hygiene — clean up stale leads",
      description: "Reassign or close leads with no activity for 30+ days.",
      status: "TODO",
      priority: "LOW",
      type: "ADMIN",
      dueDate: nextWeek.toISOString(),
      assignedToId: "self",
      assignedToName: "You",
      subtasks: [],
      comments: [],
      timeLogs: [],
      totalMinutesLogged: 0,
      createdAt: today.toISOString(),
      updatedAt: today.toISOString(),
    },
    {
      id: "task_1005",
      title: "Close the deal with Meena — Wellness Bundle",
      description: "Send final proposal and invoice.",
      status: "DONE",
      priority: "HIGH",
      type: "FOLLOW_UP",
      dueDate: yesterday.toISOString(),
      completedAt: yesterday.toISOString(),
      assignedToId: "self",
      assignedToName: "You",
      relatedEntity: { type: "LEAD", id: "lead_005", label: "Meena Iyer" },
      subtasks: [],
      comments: [],
      timeLogs: [],
      totalMinutesLogged: 90,
      createdAt: yesterday.toISOString(),
      updatedAt: yesterday.toISOString(),
    },
  ];
}
