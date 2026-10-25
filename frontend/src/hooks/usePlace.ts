import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_PLACE,
  LOCATION_OFF_NOTE,
  detectPlace,
  resolvePlace,
  type Place,
} from "@/data/places";

export type PlaceStatus = "detecting" | "resolving" | "ready" | "empty" | "error";

export type PlaceState = {
  place: Place | null;
  status: PlaceStatus;
  /** Context for the reading, e.g. a fallback or an unpinned area. */
  note: string | null;
};

const detectionKey = (region: string, country: string, area: string) =>
  `${region}|${country}|${area}`;

/**
 * Owns the header filters and turns them into a place with coordinates.
 *
 * - First load runs IP detection once and pre-fills the filters.
 * - Every later filter change resolves explicitly (geocoded, throttled).
 * - Region-only selections resolve to `empty` on purpose: a continent has no
 *   single air reading, so the page asks for a country.
 */
export function usePlace() {
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [area, setArea] = useState("");
  const [state, setState] = useState<PlaceState>({
    place: null,
    status: "detecting",
    note: null,
  });

  /** Bumped to re-run detection ("Use my location" / filters cleared). */
  const [detectToken, setDetectToken] = useState(0);
  /** Set before detection writes the filters so the resolve effect skips the echo. */
  const detectedKey = useRef<string | null>(null);
  const firstResolve = useRef(true);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setState({ place: null, status: "detecting", note: null });

    detectPlace(controller.signal).then((detected) => {
      if (!alive) return;
      const next = detected ?? DEFAULT_PLACE;
      setState({
        place: next,
        status: "ready",
        note: detected ? null : LOCATION_OFF_NOTE,
      });
      if (next.region || next.country || next.area) {
        detectedKey.current = detectionKey(next.region, next.country, next.area);
        setRegion(next.region);
        setCountry(next.country);
        setArea(next.area);
      }
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [detectToken]);

  useEffect(() => {
    // Skip the effect's first run: detection is already in flight.
    if (firstResolve.current) {
      firstResolve.current = false;
      return;
    }

    const key = detectionKey(region, country, area);
    if (detectedKey.current === key) {
      detectedKey.current = null;
      return;
    }

    if (!region && !country && !area) {
      setDetectToken((token) => token + 1);
      return;
    }

    if (!country) {
      setState({ place: null, status: "empty", note: null });
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setState({ place: null, status: "resolving", note: null });

    resolvePlace(region, country, area, controller.signal).then(({ place, note }) => {
      if (!alive) return;
      setState({ place, status: place ? "ready" : "error", note });
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [region, country, area]);

  const useMyLocation = useCallback(() => {
    setDetectToken((token) => token + 1);
  }, []);

  const selectRegion = useCallback((value: string) => {
    setRegion(value);
    setCountry("");
    setArea("");
  }, []);

  const selectCountry = useCallback((value: string) => {
    setCountry(value);
    setArea("");
  }, []);

  const selectArea = useCallback((value: string) => {
    setArea(value);
  }, []);

  return {
    region,
    country,
    area,
    state,
    selectRegion,
    selectCountry,
    selectArea,
    useMyLocation,
  };
}
