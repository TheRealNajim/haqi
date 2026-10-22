/**
 * Single data-access boundary. FIXTURES mode is ON by default so the whole
 * app runs offline against /fixtures before the backend exists.
 *
 * Set VITE_USE_FIXTURES=false and VITE_API_BASE=http://localhost:8000 to
 * point at a live backend later — screens stay unchanged.
 */
import type {
  AskFixtures,
  AskVerdict,
  TodayPayload,
  WhyPayload,
} from "@/types";

import todayFixture from "../../fixtures/today.json";
import whyFixture from "../../fixtures/why.json";
import askFixture from "../../fixtures/ask.json";

const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES !== "false";
const API_BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export const isFixturesMode = USE_FIXTURES;

function asToday(data: unknown): TodayPayload {
  return data as TodayPayload;
}

function asWhy(data: unknown): WhyPayload {
  return data as WhyPayload;
}

function asAsk(data: unknown): AskFixtures {
  return data as AskFixtures;
}

export async function fetchToday(): Promise<TodayPayload> {
  if (USE_FIXTURES) {
    return asToday(todayFixture);
  }
  const res = await fetch(`${API_BASE}/today`);
  if (!res.ok) throw new Error(`today failed: ${res.status}`);
  return asToday(await res.json());
}

export async function fetchWhy(ledgerId: string): Promise<WhyPayload> {
  if (USE_FIXTURES) {
    const payload = asWhy(whyFixture);
    return { ...payload, ledger_id: ledgerId || payload.ledger_id };
  }
  const res = await fetch(`${API_BASE}/why/${encodeURIComponent(ledgerId)}`);
  if (!res.ok) throw new Error(`why failed: ${res.status}`);
  return asWhy(await res.json());
}

export async function fetchAskSuggestions(): Promise<string[]> {
  if (USE_FIXTURES) {
    return asAsk(askFixture).suggestions;
  }
  // Backend has no suggestions endpoint yet — keep fixture list.
  return asAsk(askFixture).suggestions;
}

function matchAsk(question: string): AskVerdict & { question_echo?: string } {
  const ask = asAsk(askFixture);
  const q = question.toLowerCase();
  for (const entry of ask.responses) {
    if (entry.match.some((token) => q.includes(token.toLowerCase()))) {
      return { ...entry.verdict, question_echo: entry.question_echo };
    }
  }
  return ask.fallback;
}

export async function askQuestion(
  question: string,
): Promise<AskVerdict & { question_echo: string }> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new Error("Type a question about the air outside.");
  }

  if (USE_FIXTURES) {
    const hit = matchAsk(trimmed);
    return {
      level: hit.level,
      window: hit.window,
      reason: hit.reason,
      aqi: hit.aqi,
      small_print: hit.small_print,
      question_echo: "question_echo" in hit && hit.question_echo ? hit.question_echo : trimmed,
    };
  }

  const res = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: trimmed,
      lat: 6.6018,
      lon: 3.3515,
      profile: "asthma",
    }),
  });
  if (!res.ok) throw new Error(`ask failed: ${res.status}`);
  const data = (await res.json()) as {
    level: AskVerdict["level"];
    window: string;
    reason: string;
    aqi: number | null;
    evidence?: { claim?: string }[];
  };
  return {
    level: data.level,
    window: data.window,
    reason: data.reason,
    aqi: data.aqi,
    small_print:
      data.evidence?.[0]?.claim ??
      "Live backend answer — open Why? for the evidence chain.",
    question_echo: trimmed,
  };
}
