/**
 * Where "Today" is looking.
 *
 * First load: the visitor's network gives an approximate city (ipwho.is —
 * public, key-less). When someone changes the header filters we geocode the
 * chosen country/area with Nominatim (OpenStreetMap, also public and
 * key-less) and throttle to their one-request-per-second policy.
 *
 * A whole region has no single coordinate, so a region-only selection resolves
 * to `null` and the page asks for a country instead of inventing a reading.
 */

import { AREAS_BY_COUNTRY, COUNTRIES_BY_REGION } from "@/data/geo";
import { USE_FIXTURES } from "@/lib/api";

export type PlaceSource = "ip" | "manual" | "default";

export type Place = {
  region: string;
  country: string;
  area: string;
  /** Human label for the reading, e.g. "Lagos, Nigeria". */
  label: string;
  lat: number;
  lon: number;
  source: PlaceSource;
};

export type PlaceResolution = {
  place: Place | null;
  /** Set when we had to fall back to a wider area. */
  note: string | null;
};

/** The product's pilot city, used when IP detection is unavailable. */
export const DEFAULT_PLACE: Place = {
  region: "Africa",
  country: "Nigeria",
  area: "Lagos",
  label: "Lagos, Nigeria",
  lat: 6.5244,
  lon: 3.3792,
  source: "default",
};

export const LOCATION_OFF_NOTE =
  "Location detection is off, so this is our Lagos pilot. Pick a country above to look elsewhere.";

const COUNTRY_ALIASES: Record<string, string> = {
  "united states of america": "United States",
  usa: "United States",
  "u.s.a.": "United States",
  "republic of korea": "South Korea",
  "korea, republic of": "South Korea",
  türkiye: "Turkey",
  turkiye: "Turkey",
  "russian federation": "Russia",
  "czech republic": "Czechia",
  "ivory coast": "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  "viet nam": "Vietnam",
};

type IpWhoIsResponse = {
  success?: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+state$/, "");

/** Match a country name from an external service to our curated list. */
export function canonicalCountry(name: string | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return "";
  const direct = Object.keys(COUNTRIES_BY_REGION).find(
    (region) =>
      COUNTRIES_BY_REGION[region]?.some((country) => normalize(country) === normalize(raw)) ??
      false,
  );
  if (direct) {
    return (
      Object.values(COUNTRIES_BY_REGION)
        .flat()
        .find((country) => normalize(country) === normalize(raw)) ?? ""
    );
  }
  return COUNTRY_ALIASES[normalize(raw)] ?? "";
}

function regionForCountry(country: string): string {
  if (!country) return "";
  return (
    Object.entries(COUNTRIES_BY_REGION).find(([, countries]) =>
      countries?.includes(country),
    )?.[0] ?? ""
  );
}

/** First candidate that is a real area in the country (city, then state). */
function areaForCountry(country: string, candidates: (string | undefined)[]): string {
  const areas = AREAS_BY_COUNTRY[country] ?? [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = areas.find((area) => normalize(area) === normalize(candidate));
    if (match) return match;
  }
  return "";
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: string, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

function placeFromIp(data: IpWhoIsResponse): Place | null {
  const lat = data.latitude;
  const lon = data.longitude;
  if (typeof lat !== "number" || typeof lon !== "number") return null;

  const country = canonicalCountry(data.country);
  const region = regionForCountry(country);
  const area = country ? areaForCountry(country, [data.region, data.city]) : "";
  const label = [data.city, country || data.country].filter(Boolean).join(", ");

  return {
    region,
    country,
    area,
    label: label || data.country || "Your approximate area",
    lat,
    lon,
    source: "ip",
  };
}

/** Approximate the visitor's place from their network. */
export async function detectPlace(signal?: AbortSignal): Promise<Place | null> {
  if (USE_FIXTURES) return { ...DEFAULT_PLACE };
  const body = (await fetchJson("https://ipwho.is/", 6_000, signal)) as IpWhoIsResponse | null;
  if (!body || body.success === false) return null;
  return placeFromIp(body);
}

type GeocodeHit = { lat: number; lon: number };

const geocodeCache = new Map<string, GeocodeHit | null>();
const GEOCODE_GAP_MS = 1_100;

let lastGeocodeAt = 0;
let geocodeQueue: Promise<unknown> = Promise.resolve();

async function geocodeOnce(query: string, signal?: AbortSignal): Promise<GeocodeHit | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "en");

  const body = (await fetchJson(url.toString(), 8_000, signal)) as
    { lat?: string; lon?: string }[] | null;
  const first = Array.isArray(body) ? body[0] : undefined;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/** Serialise geocodes so we stay inside Nominatim's one-per-second policy. */
function queueGeocode(query: string, signal?: AbortSignal): Promise<GeocodeHit | null> {
  const key = query.trim().toLowerCase();
  if (geocodeCache.has(key)) return Promise.resolve(geocodeCache.get(key) ?? null);

  const run = async (): Promise<GeocodeHit | null> => {
    const wait = Math.max(0, GEOCODE_GAP_MS - (Date.now() - lastGeocodeAt));
    if (wait) await delay(wait);
    if (signal?.aborted) return null;
    lastGeocodeAt = Date.now();
    const hit = await geocodeOnce(query, signal);
    geocodeCache.set(key, hit);
    return hit;
  };

  const next = geocodeQueue.then(run, run);
  geocodeQueue = next.catch(() => null);
  return next;
}

function fixturePlace(region: string, country: string, area: string): Place {
  const label = area ? `${area}, ${country}` : country;
  return {
    ...DEFAULT_PLACE,
    region,
    country,
    area,
    label,
    source: "manual",
  };
}

type CountryCenter = { lat: number; lon: number };

const countryCenterCache = new Map<string, CountryCenter | null>();

/**
 * Country centroid for the "Top Regions" ranking.
 *
 * Uses Open-Meteo's geocoder because it resolves country names reliably and
 * allows parallel lookups (Nominatim asks for one request per second).
 */
export async function countryCenter(country: string): Promise<CountryCenter | null> {
  const key = country.trim().toLowerCase();
  if (countryCenterCache.has(key)) return countryCenterCache.get(key) ?? null;
  if (USE_FIXTURES) return { lat: DEFAULT_PLACE.lat, lon: DEFAULT_PLACE.lon };

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", country);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const body = (await fetchJson(url.toString(), 6_000)) as {
    results?: { latitude?: number; longitude?: number; feature_code?: string }[];
  } | null;

  const results = body?.results ?? [];
  const match =
    results.find((item) => item.feature_code === "PCLI") ??
    results.find((item) => typeof item.latitude === "number" && typeof item.longitude === "number");

  const lat = Number(match?.latitude);
  const lon = Number(match?.longitude);
  const center = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  countryCenterCache.set(key, center);
  return center;
}

/**
 * Turn the header filters into coordinates.
 * Region-only selections return `null`: a continent has no single air reading.
 */
export async function resolvePlace(
  region: string,
  country: string,
  area: string,
  signal?: AbortSignal,
): Promise<PlaceResolution> {
  if (!country) return { place: null, note: null };
  if (USE_FIXTURES) return { place: fixturePlace(region, country, area), note: null };

  if (area) {
    const hit = await queueGeocode(`${area}, ${country}`, signal);
    if (hit) {
      return {
        place: { region, country, area, label: `${area}, ${country}`, source: "manual", ...hit },
        note: null,
      };
    }
  }

  const hit = await queueGeocode(country, signal);
  if (hit) {
    return {
      place: { region, country, area: "", label: country, source: "manual", ...hit },
      note: area ? `We could not pin ${area}, so this is the ${country} reading.` : null,
    };
  }

  return { place: null, note: "We could not find that place. Pick another country." };
}
