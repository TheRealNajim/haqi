export type VerdictLevel = "good to go" | "be careful" | "stay in";

export type SourceType = "station" | "satellite" | "forecast" | "advisory";

export type EvidenceKind = "observation" | "forecast" | "inference" | "assessment";

export interface Evidence {
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
}

export interface Pollutant {
  id: string;
  label: string;
  value: number;
  unit: string;
  kind: "observation" | "forecast";
}

export interface LocationInfo {
  name: string;
  lat: number;
  lon: number;
  note: string;
}

export interface TodayPayload {
  schema_version: number;
  fallback: boolean;
  location: LocationInfo;
  observed_at: string;
  retrieved_at: string;
  level: VerdictLevel;
  window: string;
  reason: string;
  aqi: number | null;
  pollutants: Pollutant[];
  recommendation: string;
  evidence: Evidence[];
  blind_spots: string[];
  ledger_id: string | null;
}

export interface AskVerdict {
  level: VerdictLevel;
  window: string;
  reason: string;
  aqi: number | null;
  small_print: string;
}

export interface AskResponse {
  id: string;
  match: string[];
  question_echo: string;
  verdict: AskVerdict;
}

export interface AskFixtures {
  schema_version: number;
  suggestions: string[];
  responses: AskResponse[];
  fallback: AskVerdict;
}

export interface WhyNode {
  id: string;
  type: string;
  label: string;
  weight: number;
  stale: boolean;
  finding: string;
  source_url: string | null;
  kind?: EvidenceKind;
}

export interface WhyEdge {
  from: string;
  to: string;
  note: string;
}

export interface WhyPayload {
  schema_version: number;
  ledger_id: string;
  logged_at: string;
  question?: string;
  decision: {
    level: VerdictLevel;
    window: string;
    reason: string;
    aqi: number | null;
  };
  blind_spots: string[];
  nodes: WhyNode[];
  edges: WhyEdge[];
  note?: string;
}

export interface VerdictCardModel {
  level: VerdictLevel;
  window: string;
  reason: string;
  aqi: number | null;
  smallPrint?: string;
  ledgerId?: string | null;
}
