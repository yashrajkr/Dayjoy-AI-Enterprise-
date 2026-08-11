import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format as dateFnsFormat,
  formatDistanceToNow,
  parseISO,
  isValid,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toDate(
  date: Date | string | number | null | undefined,
): Date | null {
  if (date == null) return null;
  if (date instanceof Date) return isValid(date) ? date : null;
  if (typeof date === "number") return new Date(date);
  const parsed = parseISO(date);
  if (isValid(parsed)) return parsed;
  const fallback = new Date(date);
  return isValid(fallback) ? fallback : null;
}

export function formatDate(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "MMM d, yyyy");
}

export function formatDateTime(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date);
  if (!d) return "—";
  return dateFnsFormat(d, "MMM d, yyyy, h:mm a");
}

export function formatRelativeTime(
  date: Date | string | number | null | undefined,
): string {
  const d = toDate(date);
  if (!d) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatCurrency(
  amount: number,
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

export function formatNumber(num: number | null | undefined): string {
  if (num == null || Number.isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN").format(num);
}

export function truncate(text: string, length: number): string {
  if (!text) return "";
  if (text.length <= length) return text;
  return text.slice(0, length) + "…";
}

export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (
    parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)
  ).toUpperCase();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildQueryString(
  params: Record<string, unknown>,
): string {
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

export function safeJsonParse<T>(
  value: string | null | undefined,
  fallback: T,
): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return Promise.resolve();
  }
  return navigator.clipboard.writeText(text);
}
