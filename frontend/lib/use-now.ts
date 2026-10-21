'use client';

import { useEffect, useState } from 'react';

/**
 * Wall-clock timestamp that ticks every `intervalMs`. Lets "last update Xs ago"
 * and the 60 s signal-lost state advance on a steady ticker instead of
 * re-rendering on every socket event.
 */
export function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
