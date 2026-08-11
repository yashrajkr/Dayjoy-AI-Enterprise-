"use client";

/**
 * Barrel export for all shared responsive components. Importing from
 * `@/components/responsive` keeps consumer files agnostic of the
 * underlying implementation files.
 *
 * ```tsx
 * import {
 *   ResponsiveSidebar,
 *   ResponsiveTable,
 *   ResponsiveForm,
 *   ResponsiveGrid,
 *   ResponsiveCard,
 *   ResponsiveChart,
 *   TouchOptimizedButton,
 *   BottomNavigation,
 *   PullToRefresh,
 *   SwipeableCard,
 * } from "@/components/responsive";
 * ```
 */
export { ResponsiveSidebar } from "./responsive-sidebar";
export type { ResponsiveSidebarProps } from "./responsive-sidebar";

export { ResponsiveTable } from "./responsive-table";
export type {
  ResponsiveTableProps,
  ResponsiveTableColumn,
} from "./responsive-table";

export {
  ResponsiveForm,
  ResponsiveFormField,
} from "./responsive-form";
export type {
  ResponsiveFormProps,
  ResponsiveFormFieldProps,
} from "./responsive-form";

export { ResponsiveGrid } from "./responsive-grid";
export type {
  ResponsiveGridProps,
  ResponsiveGridCols,
} from "./responsive-grid";

export { ResponsiveCard } from "./responsive-card";
export type { ResponsiveCardProps } from "./responsive-card";

export { ResponsiveChart } from "./responsive-chart";
export type { ResponsiveChartProps } from "./responsive-chart";

export { TouchOptimizedButton } from "./touch-optimized-button";
export type { TouchOptimizedButtonProps } from "./touch-optimized-button";

export { BottomNavigation } from "./bottom-navigation";
export type {
  BottomNavigationProps,
  BottomNavItem,
} from "./bottom-navigation";

export { PullToRefresh } from "./pull-to-refresh";
export type { PullToRefreshProps } from "./pull-to-refresh";

export { SwipeableCard } from "./swipeable-card";
export type { SwipeableCardProps, SwipeAction } from "./swipeable-card";
