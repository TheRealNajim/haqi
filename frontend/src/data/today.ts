/**
 * Live readings for the Today page.
 *
 * One call to the verdict API per place, cached briefly so switching between
 * filters does not re-run the backend's whole evidence chain each time.
 * A labelled backend fallback is kept as demo data, never shown as live.
 */

import { ApiError, USE_FIXTURES, fetchToday, type Verdict } from "@/lib/api";

export type TodayReading = {
  verdict: Verdict;
  /** ISO time the app received this answer. */
  fetchedAt: string;
  /** True for the offline demo fixture or a labelled backend fallback. */
  demo: boolean;
};

const CACHE_TTL_MS = 2 * 60_000;
const cache = new Map<string, { at: number; reading: TodayReading }>();
/** One in-flight request per coordinate, so two mounted views share a fetch. */
const inflight = new Map<string, Promise<TodayReading>>();

export function demoReading(): TodayReading {
  const observed = new Date(Date.now() - 20 * 60_000).toISOString();
  const verdict: Verdict = {
    schema_version: 1,
    level: "be careful",
    window: "next 3 hours",
    reason:
      "Demo snapshot: a nearby station is reading elevated PM2.5, so sensitive groups should take it easy.",
    aqi: 82,
    evidence: [
      {
        claim: "demo station reads PM2.5 32 µg/m³ — logged 20 minutes ago",
        source_id: "openaq:demo",
        source_type: "station",
        retrieved_at: observed,
        observed_at: observed,
        geo_distance_km: 1.2,
        raw_value: 32,
        unit: "µg/m³",
        confidence: 0.82,
        staleness_flag: false,
        weight: 0.82,
      },
      {
        claim: "demo city index reads AQI 82 (~32 µg/m³ PM2.5-equivalent)",
        source_id: "waqi:demo",
        source_type: "station",
        retrieved_at: observed,
        observed_at: observed,
        geo_distance_km: null,
        raw_value: 32,
        unit: "µg/m³",
        confidence: 0.9,
        staleness_flag: false,
        weight: 0.9,
      },
      {
        claim: "demo wind forecast ~2.1 m/s — light — little dispersal",
        source_id: "openweather:demo",
        source_type: "forecast",
        retrieved_at: observed,
        observed_at: observed,
        geo_distance_km: null,
        raw_value: 2.1,
        unit: "m/s",
        confidence: 0.6,
        staleness_flag: false,
        weight: 0.6,
      },
    ],
    blind_spots: [
      "Demo fixture: the Bright Data advisory key is pending, so government advisories are not checked.",
      "Pollen is Europe-only by design, so Lagos gets a disclosed blind spot.",
    ],
    ledger_id: null,
    fallback: true,
  };
  return { verdict, fetchedAt: new Date().toISOString(), demo: true };
}

/** Load the live verdict for a coordinate, with a short-lived cache. */
export async function loadToday(lat: number, lon: number, force = false): Promise<TodayReading> {
  if (USE_FIXTURES) return demoReading();

  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.reading;

  const pending = force ? undefined : inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const verdict = await fetchToday(lat, lon);
    const reading: TodayReading = {
      verdict,
      fetchedAt: new Date().toISOString(),
      demo: verdict.fallback,
    };
    cache.set(key, { at: Date.now(), reading });
    return reading;
  })()
    .catch((error: unknown) => {
      // The error contract can carry a labelled fallback verdict; show it as
      // demo data rather than hiding the page behind an error.
      if (error instanceof ApiError && error.fallback) {
        return { verdict: error.fallback, fetchedAt: new Date().toISOString(), demo: true };
      }
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function clearTodayCache() {
  cache.clear();
}
