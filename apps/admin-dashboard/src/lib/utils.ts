import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format as dateFnsFormat,
  formatDistanceToNow,
  formatDuration as dateFnsFormatDuration,
  intervalToDuration,
  parseISO,
  isValid,
} from "date-fns";

/**
 * Merge Tailwind CSS classes with proper conflict resolution.
 *
 * @example
 *   cn("px-2 py-1", "px-4") // → "py-1 px-4" (px-4 wins)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Coerce strings/Dates into a Date (or `null` if invalid). */
function toDate(date: Date | string | number | null | undefined): Date | null {
  if (date == null) return null;
  if (date instanceof Date) return isValid(date) ? date : null;
  if (typeof date === "number") return new Date(date);
  const parsed = parseISO(date);
  if (isValid(parsed)) return parsed;
  const fallback = new Date(date);
  return isValid(fallback) ? fallback : null;
}

/**
 * Format a date string for display.
 *
 * @example formatDate("2025-01-15T10:00:00Z") → "Jan 15, 2025"
 */
export function formatDate(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "MMM d, yyyy");
}

/**
 * Format a date-time string for display.
 *
 * @example formatDateTime("2025-01-15T10:00:00Z") → "Jan 15, 2025, 10:00 AM"
 */
export function formatDateTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "MMM d, yyyy, h:mm a");
}

/**
 * Format a date as a relative time ("2 hours ago", "in 3 days").
 */
export function formatRelativeTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Format a number as currency.
 *
 * @example formatCurrency(1499.99, "USD") → "$1,499.99"
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD",
  options: Intl.NumberFormatOptions = {},
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

/**
 * Format a number with thousands separators.
 *
 * @example formatNumber(1234567) → "1,234,567"
 */
export function formatNumber(num: number | null | undefined): string {
  if (num == null || Number.isNaN(num)) return "0";
  return new Intl.NumberFormat("en-US").format(num);
}

/**
 * Format a number as a percentage.
 *
 * @example formatPercent(0.8523) → "85.23%"
 */
export function formatPercent(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

/**
 * Format a duration (in seconds) as `HH:MM:SS` or `MM:SS`.
 *
 * @example formatDuration(75) → "1:15"
 * @example formatDuration(3661) → "1:01:01"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0 || Number.isNaN(seconds)) return "0:00";
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  return dateFnsFormatDuration(duration, {
    format: ["hours", "minutes", "seconds"],
    delimiter: ":",
    zero: true,
    locale: { code: "en-US" } as never,
  }).replace(/\b(\d)\b/g, "0$1") || "0:00";
}

/**
 * Format a duration in milliseconds as `Xms` or `Xs Yms`.
 */
export function formatLatency(ms: number): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(text: string, length: number): string {
  if (!text) return "";
  if (text.length <= length) return text;
  return text.slice(0, length) + "…";
}

/**
 * Convert a string to a URL-safe slug.
 *
 * @example slugify("Hello, World!") → "hello-world"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Get initials from a name.
 */
export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Status → Tailwind badge class. Used for `<Badge>` components in
 * tables/cards to keep status visualisation consistent across the app.
 */
export function getStatusColor(status: string | null | undefined): string {
  if (!status) return "bg-muted text-muted-foreground";
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    verified: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    paid: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    delivered: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    published: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    resolved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    inactive: "bg-muted text-muted-foreground",
    suspended: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    processing: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    unverified: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    failed: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    cancelled: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    refunded: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    returned: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    shipped: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    confirmed: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  };
  return map[s] ?? "bg-muted text-muted-foreground";
}

/**
 * Sleep helper (mostly used in dev/mock code).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build query string from a params object, omitting `undefined`/`null`.
 */
export function buildQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, String(v));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Safely parse JSON without throwing.
 */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
