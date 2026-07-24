"use client";

import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  // Read from localStorage on mount (safe for SSR)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch {
      // Ignore parse errors, fall back to initial value
    }
    setIsLoaded(true);
  }, [key]);

  // Write to localStorage whenever the value changes
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const next =
          value instanceof Function
            ? (value as (prev: T) => T)(storedValue)
            : value;
        setStoredValue(next);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(next));
        }
      } catch {
        // Ignore storage errors (quota exceeded, etc.)
      }
    },
    [key, storedValue],
  );

  return [storedValue, setValue, isLoaded] as const;
}
