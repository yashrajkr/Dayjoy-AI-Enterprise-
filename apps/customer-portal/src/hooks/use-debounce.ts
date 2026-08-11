"use client";

import { useEffect, useState } from "react";

/**
 * `useDebounce` — returns a debounced copy of `value` that only updates
 * after `delay` ms have elapsed without a change. Used by the product
 * search box to avoid hammering the API on every keystroke.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
