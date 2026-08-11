import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  DateRangePreset,
} from "@/lib/constants";
import type { DistributorTier } from "@/types/distributor.types";
import type { TeamMemberStatus } from "@/types/team.types";

export interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

interface FiltersState {
  // Date range (used by Sales + Earnings + Commissions)
  datePreset: DateRangePreset;
  dateRange: DateRange;

  // Team filters
  teamSearch: string;
  teamTierFilter: DistributorTier | "ALL";
  teamLevelFilter: number | "ALL";
  teamStatusFilter: TeamMemberStatus | "ALL";

  // Commission filters
  commissionStatus: "ALL" | "PENDING" | "PAID" | "CANCELLED";
  commissionSearch: string;

  // Actions
  setDatePreset: (preset: DateRangePreset) => void;
  setDateRange: (range: DateRange) => void;
  setTeamSearch: (s: string) => void;
  setTeamTierFilter: (t: FiltersState["teamTierFilter"]) => void;
  setTeamLevelFilter: (l: FiltersState["teamLevelFilter"]) => void;
  setTeamStatusFilter: (s: FiltersState["teamStatusFilter"]) => void;
  setCommissionStatus: (s: FiltersState["commissionStatus"]) => void;
  setCommissionSearch: (s: string) => void;
  resetTeamFilters: () => void;
  resetCommissionFilters: () => void;
}

const defaultTeamFilters = {
  teamSearch: "",
  teamTierFilter: "ALL" as const,
  teamLevelFilter: "ALL" as const,
  teamStatusFilter: "ALL" as const,
};

const defaultCommissionFilters = {
  commissionStatus: "ALL" as const,
  commissionSearch: "",
};

/**
 * Filters store — holds the active date-range, team filters and
 * commission filters. Persisted so a refresh preserves the user's
 * working context.
 */
export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
      datePreset: "30d",
      dateRange: { startDate: null, endDate: null },
      ...defaultTeamFilters,
      ...defaultCommissionFilters,

      setDatePreset: (preset) => set({ datePreset: preset }),
      setDateRange: (range) => set({ dateRange: range }),
      setTeamSearch: (s) => set({ teamSearch: s }),
      setTeamTierFilter: (t) => set({ teamTierFilter: t }),
      setTeamLevelFilter: (l) => set({ teamLevelFilter: l }),
      setTeamStatusFilter: (s) => set({ teamStatusFilter: s }),
      setCommissionStatus: (s) => set({ commissionStatus: s }),
      setCommissionSearch: (s) => set({ commissionSearch: s }),
      resetTeamFilters: () => set({ ...defaultTeamFilters }),
      resetCommissionFilters: () => set({ ...defaultCommissionFilters }),
    }),
    {
      name: "dp-filters-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        datePreset: state.datePreset,
        dateRange: state.dateRange,
        teamTierFilter: state.teamTierFilter,
        teamLevelFilter: state.teamLevelFilter,
        teamStatusFilter: state.teamStatusFilter,
        commissionStatus: state.commissionStatus,
      }),
    },
  ),
);

/**
 * Compute the actual start/end ISO strings for a preset. Returns `null`
 * for `custom` (caller should fall back to `dateRange`).
 */
export function resolveDateRange(
  preset: DateRangePreset,
  custom: DateRange,
): DateRange {
  const now = new Date();
  const end = now.toISOString();
  switch (preset) {
    case "today": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { startDate: start.toISOString(), endDate: end };
    }
    case "7d": {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return { startDate: start.toISOString(), endDate: end };
    }
    case "30d": {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return { startDate: start.toISOString(), endDate: end };
    }
    case "90d": {
      const start = new Date();
      start.setDate(start.getDate() - 90);
      return { startDate: start.toISOString(), endDate: end };
    }
    case "ytd": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.toISOString(), endDate: end };
    }
    case "custom":
    default:
      return custom;
  }
}
