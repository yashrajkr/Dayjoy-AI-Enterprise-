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

/** Merge Tailwind CSS classes with proper conflict resolution. */
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

/** Format a date string for display. */
export function formatDate(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "MMM d, yyyy");
}

/** Format a date-time string for display. */
export function formatDateTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "MMM d, yyyy, h:mm a");
}

/** Format a time only (e.g. "10:30 AM"). */
export function formatTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "h:mm a");
}

/** Format a date as a relative time ("2 hours ago"). */
export function formatRelativeTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

/** Format a number as currency. */
export function formatCurrency(
  amount: number | null | undefined,
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

/** Format a number with thousands separators. */
export function formatNumber(num: number | null | undefined): string {
  if (num == null || Number.isNaN(num)) return "0";
  return new Intl.NumberFormat("en-US").format(num);
}

/** Format a number as a percentage. Pass a fraction (0.8523) by default. */
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

/** Format a duration (in seconds) as `HH:MM:SS` or `MM:SS`. */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0 || Number.isNaN(seconds)) return "0:00";
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  return (
    dateFnsFormatDuration(duration, {
      format: ["hours", "minutes", "seconds"],
      delimiter: ":",
      zero: true,
      locale: { code: "en-US" } as never,
    }).replace(/\b(\d)\b/g, "0$1") || "0:00"
  );
}

/** Format hours-and-minutes given hours as decimal (e.g. 8.5 → "8h 30m"). */
export function formatHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format a duration in milliseconds as `Xms` or `Xs Yms`. */
export function formatLatency(ms: number): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Truncate text with ellipsis. */
export function truncate(text: string, length: number): string {
  if (!text) return "";
  if (text.length <= length) return text;
  return text.slice(0, length) + "…";
}

/** Convert a string to a URL-safe slug. */
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

/** Get initials from a name. */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/** Status → Tailwind badge class (consistent status visualisation). */
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
    present: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    inactive: "bg-muted text-muted-foreground",
    suspended: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    processing: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    unverified: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    late: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    "half-day": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    half_day: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    leave: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    "on-leave": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    on_leave: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    failed: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    cancelled: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    rejected: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    refunded: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    returned: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    absent: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    shipped: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    confirmed: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    open: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    "in-progress": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  };
  return map[s] ?? "bg-muted text-muted-foreground";
}

/** Sleep helper (mostly used in dev/mock code). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build query string from a params object, omitting `undefined`/`null`. */
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

/** Safely parse JSON without throwing. */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Trigger a client-side CSV download from rows of objects. */
export function downloadCSV(filename: string, rows: Record<string, unknown>[]): void {
  if (typeof window === "undefined") return;
  if (!rows.length) {
    const blob = new Blob([""], { type: "text/csv;charset=utf-8;" });
    triggerDownload(filename, blob);
    return;
  }
  const headers = Object.keys(rows[0]!);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const v = row[h];
          if (v == null) return "";
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(filename, blob);
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Returns true if the given date is in the past. */
export function isOverdue(
  date: Date | string | number | null | undefined,
): boolean {
  if (date == null) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

/** Returns true if the given date is today (in the local timezone). */
export function isToday(
  date: Date | string | number | null | undefined,
): boolean {
  if (date == null) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/** Returns true if the given date falls within the next 7 days (inclusive of today). */
export function isThisWeek(
  date: Date | string | number | null | undefined,
): boolean {
  if (date == null) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 7;
}
