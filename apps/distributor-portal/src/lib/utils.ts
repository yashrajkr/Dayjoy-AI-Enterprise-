import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format as dateFnsFormat,
  formatDistanceToNow,
  parseISO,
  isValid,
  differenceInDays,
  differenceInMonths,
} from "date-fns";

/**
 * Merge Tailwind CSS classes with proper conflict resolution.
 *
 * @example cn("px-2 py-1", "px-4") // → "py-1 px-4"
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

/** Format a date string for display — `MMM d, yyyy`. */
export function formatDate(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "MMM d, yyyy");
}

/** Format a date-time string — `MMM d, yyyy, h:mm a`. */
export function formatDateTime(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "MMM d, yyyy, h:mm a");
}

/** Format a relative time ("2 hours ago", "in 3 days"). */
export function formatRelativeTime(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date);
  if (!d) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

/** Days between two dates (positive integer). */
export function daysBetween(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): number {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return 0;
  return Math.abs(differenceInDays(e, s));
}

/** Months between two dates. */
export function monthsBetween(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): number {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return 0;
  return Math.abs(differenceInMonths(e, s));
}

/**
 * Format a number as INR currency (default for Dayjoy).
 *
 * @example formatCurrency(1499.99) → "₹1,499.99"
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = "INR",
  options: Intl.NumberFormatOptions = {},
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

/** Compact currency — `₹1.2L`, `₹3.4Cr` (Indian numbering). */
export function formatCurrencyCompact(
  amount: number | null | undefined,
  currency: string = "INR",
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_00_00_000) {
    return `${sign}${new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 1,
      notation: "compact",
    }).format(abs)}`;
  }
  if (abs >= 1_00_000) {
    return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  }
  if (abs >= 1_000) {
    return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(amount, currency, { maximumFractionDigits: 0 });
}

/** Format a number with thousands separators. */
export function formatNumber(num: number | null | undefined): string {
  if (num == null || Number.isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN").format(num);
}

/** Compact number — `1.2K`, `3.4M`. */
export function formatNumberCompact(num: number | null | undefined): string {
  if (num == null || Number.isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num);
}

/** Format a value as a percentage. */
export function formatPercent(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "percent",
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

/** Truncate text with ellipsis. */
export function truncate(text: string, length: number): string {
  if (!text) return "";
  if (text.length <= length) return text;
  return text.slice(0, length) + "…";
}

/** Get initials from a name. */
export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (
    parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)
  ).toUpperCase();
}

/** Status → Tailwind badge class for consistent visual cues. */
export function getStatusColor(status: string | null | undefined): string {
  if (!status) return "bg-muted text-muted-foreground";
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    verified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    inactive: "bg-muted text-muted-foreground",
    suspended: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    draft: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    processing: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    unverified: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    new: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    contacted: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    qualified: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
    failed: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    cancelled: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    error: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    refunded: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    returned: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    shipped: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    bronze: "bg-amber-700/15 text-amber-800 dark:text-amber-500",
    silver: "bg-slate-400/15 text-slate-700 dark:text-slate-300",
    gold: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    platinum: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  };
  return map[s] ?? "bg-muted text-muted-foreground";
}

/** Sleep helper. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** Build query string from params, omitting `undefined`/`null`. */
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
 * Download arbitrary text (CSV/JSON) as a file from the browser.
 */
export function downloadFile(
  filename: string,
  content: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convert an array of objects to a CSV string. Escapes commas/quotes.
 */
export function arrayToCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: { key: keyof T; label: string }[],
): string {
  if (rows.length === 0) return "";
  const cols =
    columns ??
    (Object.keys(rows[0]!).map((k) => ({ key: k as keyof T, label: k })) as {
      key: keyof T;
      label: string;
    }[]);

  const escape = (val: unknown): string => {
    if (val == null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = cols.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((row) => cols.map((c) => escape(row[c.key])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

/**
 * Tier → friendly label + color (used in cards/badges).
 */
export const TIER_META: Record<
  string,
  { label: string; color: string; ring: string; minSales: number }
> = {
  BRONZE: {
    label: "Bronze",
    color: "text-amber-700 dark:text-amber-500",
    ring: "ring-amber-600/30 bg-amber-600/10",
    minSales: 0,
  },
  SILVER: {
    label: "Silver",
    color: "text-slate-700 dark:text-slate-300",
    ring: "ring-slate-400/30 bg-slate-400/10",
    minSales: 50000,
  },
  GOLD: {
    label: "Gold",
    color: "text-yellow-700 dark:text-yellow-400",
    ring: "ring-yellow-500/30 bg-yellow-500/10",
    minSales: 200000,
  },
  PLATINUM: {
    label: "Platinum",
    color: "text-cyan-700 dark:text-cyan-400",
    ring: "ring-cyan-500/30 bg-cyan-500/10",
    minSales: 500000,
  },
};

export function tierMeta(tier: string | null | undefined) {
  if (!tier) return TIER_META.BRONZE!;
  return TIER_META[tier.toUpperCase()] ?? TIER_META.BRONZE!;
}

// ===== Feature helpers (Agent 4 — additive) =====
//
// These helpers are consumed by the feature pages (leads score color,
// knowledge slugify). Appended after Agent 3's foundation utils.

/**
 * Lead score 0–100 → color (red → amber → emerald).
 */
export function getScoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  if (score >= 25) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

/**
 * Convert a string to a URL-safe slug.
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
