"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (search input, resize, etc.).
 *
 * @example
 *   const [q, setQ] = useState("");
 *   const debounced = useDebounce(q, 300);
 *   useEffect(() => fetchResults(debounced), [debounced]);
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
