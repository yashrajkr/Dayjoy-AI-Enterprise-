import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper conflict resolution.
 *
 * @example
 *   cn("px-2 py-1", "px-4") // → "py-1 px-4" (px-4 wins)
 *
 * NOTE: This is a minimal stub. Replace with the full utils file
 * when the website-chat app is built out (see other portals' utils.ts).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
