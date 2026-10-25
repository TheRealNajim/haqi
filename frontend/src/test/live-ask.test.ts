import { afterEach, describe, expect, it, vi } from "vitest";

import type { Verdict } from "@/lib/api";

const VERDICT: Verdict = {
  schema_version: 1,
  level: "good to go",
  window: "now",
  reason: "air is fine near you",
  aqi: 7,
  evidence: [
    {
      claim: "city AQI 41 (~7 µg/m³ PM2.5-equivalent)",
      source_id: "waqi:geo",
      source_type: "station",
      retrieved_at: "2026-10-25T17:18:27Z",
      observed_at: "2026-10-25T17:18:27Z",
      geo_distance_km: null,
      raw_value: 7.4,
      unit: "µg/m³",
      confidence: 0.9,
      staleness_flag: false,
      weight: 0.9,
    },
  ],
  blind_spots: ["brightdata: no key — blind to govt advisories"],
  ledger_id: "ledger-test01",
  fallback: false,
};

async function importLiveAsk() {
  vi.resetModules();
  vi.stubEnv("VITE_USE_FIXTURES", "false");
  // Deliberately set a remote base URL: in dev it must be ignored in favour of
  // the proxy, which is exactly the regression that caused the CORS failure.
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  return import("@/data/ask");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("live Ask answers", () => {
  it("defaults to live when fixtures are not explicitly enabled", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_USE_FIXTURES", "");
    const { FIXTURES_MODE } = await import("@/data/ask");
    expect(FIXTURES_MODE).toBe(false);
  });

  it("posts the question and renders the verdict verbatim", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(VERDICT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { askHaqi } = await importLiveAsk();
    const answer = await askHaqi({ question: "can I play outside now?" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    // Dev always goes through the same-origin proxy; a stray VITE_API_BASE_URL
    // (stubbed above) must not bypass it and hit the API cross-origin.
    expect(String(url)).toBe("/api/ask");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      question: "can I play outside now?",
      lat: 6.5244,
      lon: 3.3792,
    });

    expect(answer.summary).toBe("air is fine near you");
    expect(answer.verdict).toBe("good to go");
    expect(answer.provenance.live).toBe(true);
    expect(answer.blindSpots).toEqual(VERDICT.blind_spots);
    expect(answer.metrics.find((metric) => metric.label === "AQI")?.value).toBe("7");
  });

  it("shows a null AQI as no reading, never as zero", async () => {
    const verdict: Verdict = {
      ...VERDICT,
      level: "be careful",
      window: "at 4pm",
      reason: "we can only see 3 hours ahead; your plan is further out",
      aqi: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(verdict), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const { askHaqi } = await importLiveAsk();
    const answer = await askHaqi({ question: "football at 4 pm?" });

    expect(answer.metrics.find((metric) => metric.label === "AQI")?.value).toBe("—");
    expect(answer.provenance.live).toBe(true);
  });

  it("renders a 503 fallback verdict as labelled demo data", async () => {
    const fallback: Verdict = { ...VERDICT, fallback: true };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: 1,
            error: "backend hit an unexpected wall",
            fallback,
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const { askHaqi } = await importLiveAsk();
    const answer = await askHaqi({ question: "can I play?" });

    expect(answer.provenance.live).toBe(false);
    expect(answer.provenance.label).toBe("Fallback fixture · not live data");
  });

  it("retries with GET when the deployment only exposes GET /ask", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Method Not Allowed" }), { status: 405 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(VERDICT), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { askHaqi } = await importLiveAsk();
    const answer = await askHaqi({ question: "can I play?" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain("/ask?q=can+I+play%3F");
    expect(answer.provenance.live).toBe(true);
  });
});
