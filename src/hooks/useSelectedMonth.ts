// The month Overview and Budget show — shared, so switching pages keeps the
// month you picked. Kept for the session only: a fresh launch opens on today.

import { useCallback, useState } from "react";

const KEY = "selectedMonth";

function read(): Date {
  try {
    const saved = sessionStorage.getItem(KEY);
    const d = saved ? new Date(saved) : null;
    if (d && !Number.isNaN(d.getTime())) return d;
  } catch {
    // Storage unavailable: start on today.
  }
  return new Date();
}

export function useSelectedMonth(): [Date, (next: Date | ((prev: Date) => Date)) => void] {
  const [date, setDate] = useState<Date>(read);
  const set = useCallback((next: Date | ((prev: Date) => Date)) => {
    setDate((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try {
        sessionStorage.setItem(KEY, value.toISOString());
      } catch {
        // Remembering the month is a convenience only.
      }
      return value;
    });
  }, []);
  return [date, set];
}
