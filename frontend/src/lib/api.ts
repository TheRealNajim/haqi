/**
 * The one API module.
 *
 * Everything the app knows about the backend lives here so the rest of the UI
 * can stay declarative:
 *  - `USE_FIXTURES` is the single offline switch (dev/test default ON, prod OFF)
 *  - `API_BASE_URL` is same-origin `/api` in dev (proxied by Vite) and the
 *    deployed API in production
 *  - every response is parsed into the shared contract types below
 *
 * No secrets belong in the frontend. Provider keys stay in backend/.env.
 */

export type SourceType = "station" | "satellite" | "forecast" | "advisory";

export type VerdictLevel = "good to go" | "be careful" | "stay in";

export type Evidence = {
  claim: string;
  source_id: string;
  source_type: SourceType;
  retrieved_at: string;
  observed_at: string | null;
  geo_distance_km: number | null;
  raw_value: number | null;
  unit: string | null;
  confidence: number;
  staleness_flag: boolean;
  weight: number;
};

export type Verdict = {
  schema_version: number;
  level: VerdictLevel;
  window: string;
  reason: string;
  aqi: number | null;
  evidence: Evidence[];
  blind_spots: string[];
  ledger_id: string | null;
  fallback: boolean;
};

export type ErrorBody = {
  schema_version?: number;
  error: string;
  fallback: Verdict | null;
};

export type SourcesStatus = {
  schema_version: number;
  sources: {
    adapter: string;
    type: string;
    role: string;
    env_required: string[];
    configured: boolean;
  }[];
};

export const DEFAULT_LOCATION = { lat: 6.5244, lon: 3.3792 } as const;

const trimBase = (value: string | undefined) => (value ?? "").trim().replace(/\/+$/, "");

const PROD_API_BASE_URL =
  trimBase(import.meta.env["VITE_API_BASE_URL"]) || "https://haqi-api.onrender.com";

/**
 * Dev always uses the same-origin `/api` proxy, so a stray VITE_API_BASE_URL
 * cannot bypass CORS locally. Change the proxy destination with
 * VITE_API_PROXY_TARGET. Production calls the deployed API directly.
 */
export const API_BASE_URL = import.meta.env.DEV ? "/api" : PROD_API_BASE_URL;

const RAW_FIXTURES = import.meta.env["VITE_USE_FIXTURES"];

/**
 * Fixtures are the explicit offline mode and the fallback renderer. Live data
 * is the default everywhere; set VITE_USE_FIXTURES=true to work offline.
 */
export const USE_FIXTURES = RAW_FIXTURES === "true";

export class ApiError extends Error {
  readonly status: number;
  readonly fallback: Verdict | null;

  constructor(message: string, status: number, fallback: Verdict | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fallback = fallback;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 25_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
      signal: controller.signal,
    });

    const raw = await response.text();
    let body: unknown = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const failure = body as Partial<ErrorBody> | null;
      const message =
        response.status === 502
          ? "We couldn't get the latest air-quality data. Please check your internet connection and try again."
          : failure?.error?.trim() || `The service answered ${response.status}.`;
      throw new ApiError(
        message,
        response.status,
        failure?.fallback ?? null,
      );
    }

    if (body === null) {
      throw new ApiError("The service returned an empty answer.", response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The service took too long to answer.", 0);
    }
    throw new ApiError(
      "We could not reach the air-quality service. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

export type AskRequest = {
  question: string;
  lat?: number;
  lon?: number;
  profile?: string;
};

/**
 * The deployed API answers POST /ask with the verdict in the body. Some builds
 * also expose GET /ask?q=...; the fallback keeps us working against either.
 */
export async function askQuestion({
  question,
  lat = DEFAULT_LOCATION.lat,
  lon = DEFAULT_LOCATION.lon,
  profile,
}: AskRequest): Promise<Verdict> {
  const payload = {
    question,
    lat,
    lon,
    ...(profile ? { profile } : {}),
  };

  try {
    return await request<Verdict>(
      "/ask",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      90_000,
    );
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      const query = new URLSearchParams({
        q: question,
        lat: String(lat),
        lon: String(lon),
      });
      if (profile) query.set("profile", profile);
      return request<Verdict>(`/ask?${query.toString()}`, {}, 90_000);
    }
    throw error;
  }
}

export function fetchToday(
  lat: number = DEFAULT_LOCATION.lat,
  lon: number = DEFAULT_LOCATION.lon,
): Promise<Verdict> {
  const query = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return request<Verdict>(`/today?${query.toString()}`);
}

export type WhyGraph = {
  schema_version: number;
  ledger_id: string;
  logged_at: string;
  question: string;
  decision: { level: string; window: string; reason: string; aqi: number | null };
  blind_spots: string[];
  nodes: {
    id: string;
    type: string;
    label: string;
    weight: number;
    stale: boolean;
    finding: string;
    source_url: string;
  }[];
  edges: { from: string; to: string; note: string }[];
};

export function fetchWhy(ledgerId: string): Promise<WhyGraph> {
  return request<WhyGraph>(`/why/${encodeURIComponent(ledgerId)}`);
}

export function fetchSourcesStatus(): Promise<SourcesStatus> {
  return request<SourcesStatus>("/sources/status");
}

export function fetchHealth(): Promise<{ ok: boolean; adapters: string[] }> {
  return request<{ ok: boolean; adapters: string[] }>("/health");
}
