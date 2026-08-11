"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (e.g. a search input).
 *
 * @example
 *   const [q, setQ] = useState("");
 *   const debounced = useDebounce(q, 300);
 *   useEffect(() => fetch(debounced), [debounced]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
