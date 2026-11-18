"use client";

import { useEffect, useState } from "react";

/**
 * Current time that only exists after mount, so prerendered HTML never bakes in
 * a timestamp. Returns null on the server and on the first client render.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
