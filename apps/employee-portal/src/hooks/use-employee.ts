"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useAuthStore } from "@/store/auth.store";
import type { CurrentUser, Employee } from "@/types/employee.types";

/**
 * Fetch the current employee profile from `GET /api/users/me`.
 * Falls back to the persisted user from `useAuthStore` if available.
 */
export function useEmployee() {
  const storedEmployee = useAuthStore((s) => s.employee);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setEmployee = useAuthStore((s) => s.setEmployee);

  const query = useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: () => api.get<CurrentUser>("/users/me"),
    enabled: !!accessToken,
    staleTime: 60 * 1000,
  });

  // Sync any fresh profile back into the persisted store.
  if (query.data && query.data.id !== storedEmployee?.id) {
    setEmployee(query.data as Employee);
  }

  return {
    employee: (query.data ?? storedEmployee) as Employee | null,
    isLoading: query.isLoading && !storedEmployee,
    isError: query.isError && !storedEmployee,
    refetch: query.refetch,
  };
}
