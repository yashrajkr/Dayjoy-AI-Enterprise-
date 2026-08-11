"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TaskFilters } from "@/types/task.types";
import { STORAGE_KEYS } from "@/lib/constants";

interface TaskFiltersState extends TaskFilters {
  setStatus: (status: TaskFilters["status"]) => void;
  setPriority: (priority: TaskFilters["priority"]) => void;
  setAssignee: (assigneeId: TaskFilters["assigneeId"]) => void;
  setDueDate: (dueDate: TaskFilters["dueDate"]) => void;
  setSearch: (search: string) => void;
  setView: (view: "TABLE" | "KANBAN") => void;
  reset: () => void;
}

const DEFAULTS: Required<
  Omit<TaskFilters, "search"> & { search: string }
> = {
  status: "ALL",
  priority: "ALL",
  assigneeId: "ME",
  dueDate: "ALL",
  search: "",
  view: "TABLE",
};

export const useTaskFiltersStore = create<TaskFiltersState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setStatus: (status) => set({ status }),
      setPriority: (priority) => set({ priority }),
      setAssignee: (assigneeId) => set({ assigneeId }),
      setDueDate: (dueDate) => set({ dueDate }),
      setSearch: (search) => set({ search }),
      setView: (view) => set({ view }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: STORAGE_KEYS.TASK_FILTERS,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ status, priority, assigneeId, dueDate, view }) => ({
        status,
        priority,
        assigneeId,
        dueDate,
        view,
      }),
    },
  ),
);
