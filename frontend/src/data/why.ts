import fixture from "../../fixtures/why.json";

export type WhyNodeType = "verdict" | "station" | "forecast";

export type WhyNode = {
  id: string;
  type: WhyNodeType;
  label: string;
  weight: number;
  stale: boolean;
  finding: string;
  source_url: string | null;
  kind: string;
};

export type WhyEdge = {
  from: string;
  to: string;
  note: string;
};

export type WhyFixture = {
  schema_version: number;
  ledger_id: string;
  logged_at: string;
  question: string;
  decision: {
    level: string;
    window: string;
    reason: string;
    aqi: number;
  };
  blind_spots: string[];
  nodes: WhyNode[];
  edges: WhyEdge[];
};

/** Evidence chain demo data. Mirrors fixtures/why.json. */
export const WHY_FIXTURE = fixture as WhyFixture;

/** Human-readable timestamp for the fixture (fixed, so the demo is stable). */
export const WHY_SNAPSHOT = "22 Oct 2026 · 09:00 UTC";
