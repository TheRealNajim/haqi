import { useCallback, useEffect, useState } from "react";

import type { Place } from "@/data/places";
import { loadToday, type TodayReading } from "@/data/today";

export type ReadingStatus = "idle" | "loading" | "ready" | "error";

/** Fetch the live verdict for the current place, with a manual retry. */
export function useTodayReading(place: Place | null, enabled = true) {
  const [reading, setReading] = useState<TodayReading | null>(null);
  const [status, setStatus] = useState<ReadingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !place) {
      setReading(null);
      setStatus("idle");
      setError(null);
      return;
    }

    let alive = true;
    setStatus("loading");
    setError(null);

    loadToday(place.lat, place.lon, attempt > 0)
      .then((next) => {
        if (!alive) return;
        setReading(next);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : "HAQI could not load this reading.");
        setStatus("error");
      });

    return () => {
      alive = false;
    };
  }, [place, attempt, enabled]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return { reading, status, error, retry };
}
