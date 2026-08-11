"use client";

import { useMemo } from "react";
import {
  DATE_RANGE_OPTIONS,
  type DateRangePreset,
} from "@/lib/constants";
import {
  useFiltersStore,
  resolveDateRange,
  type DateRange,
} from "@/store/filters.store";

export interface DateRangeState {
  preset: DateRangePreset;
  range: DateRange;
  /** The resolved (concrete) start/end ISO strings for the active preset. */
  resolved: DateRange;
  options: typeof DATE_RANGE_OPTIONS;
  setPreset: (p: DateRangePreset) => void;
  setRange: (r: DateRange) => void;
}

/**
 * Date range picker hook — wraps the filters store and computes the
 * concrete `resolved` start/end ISO strings for the active preset.
 *
 * Components that need the actual API params should read `resolved`
 * (not `range`, which is only populated for `custom`).
 */
export function useDateRange(): DateRangeState {
  const {
    datePreset,
    dateRange,
    setDatePreset,
    setDateRange,
  } = useFiltersStore();

  const resolved = useMemo(
    () => resolveDateRange(datePreset, dateRange),
    [datePreset, dateRange],
  );

  return {
    preset: datePreset,
    range: dateRange,
    resolved,
    options: DATE_RANGE_OPTIONS,
    setPreset: setDatePreset,
    setRange: setDateRange,
  };
}
