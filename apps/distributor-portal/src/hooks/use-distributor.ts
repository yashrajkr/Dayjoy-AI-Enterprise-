"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useAuthStore } from "@/store/auth.store";
import type {
  Distributor,
  DistributorPerformance,
  CommissionSummary,
} from "@/types/distributor.types";

/**
 * Distributor hook — fetches the current distributor's profile + their
 * performance and commission summaries. The data is mirrored into the
 * auth store so the sidebar/header can render quick stats without a
 * separate request.
 *
 * All queries are disabled until the auth store has a user — this
 * prevents firing `/distributors/undefined/...` on first render.
 */
export function useDistributor() {
  const { user, distributor, setDistributor } = useAuthStore();
  const distributorId = distributor?.id ?? user?.id ?? "";

  const profileQuery = useQuery({
    queryKey: QUERY_KEYS.distributor(distributorId),
    queryFn: () => api.get<Distributor>(`/distributors/${distributorId}`),
    enabled: !!distributorId,
    staleTime: 60 * 1000,
  });

  // Mirror profile into auth store when it loads.
  useEffect(() => {
    if (profileQuery.data) {
      setDistributor(profileQuery.data as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data]);

  const performanceQuery = useQuery({
    queryKey: QUERY_KEYS.distributorPerformance(distributorId),
    queryFn: () =>
      api.get<DistributorPerformance>(
        `/distributors/${distributorId}/performance`,
      ),
    enabled: !!distributorId,
    staleTime: 60 * 1000,
  });

  const commissionsQuery = useQuery({
    queryKey: QUERY_KEYS.distributorCommissions(distributorId),
    queryFn: () =>
      api.get<CommissionSummary>(
        `/distributors/${distributorId}/commissions`,
      ),
    enabled: !!distributorId,
    staleTime: 60 * 1000,
  });

  return {
    distributor: distributor ?? profileQuery.data ?? null,
    performance: performanceQuery.data ?? null,
    commissionSummary: commissionsQuery.data ?? null,
    isLoading:
      profileQuery.isLoading ||
      performanceQuery.isLoading ||
      commissionsQuery.isLoading,
    isError:
      profileQuery.isError || performanceQuery.isError || commissionsQuery.isError,
    refetch: () =>
      Promise.all([
        profileQuery.refetch(),
        performanceQuery.refetch(),
        commissionsQuery.refetch(),
      ]),
  };
}
