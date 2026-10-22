import type { VerdictLevel } from "@/types";

export const VERDICT_LEVELS: VerdictLevel[] = [
  "good to go",
  "be careful",
  "stay in",
];

export function verdictTone(
  level: VerdictLevel,
): "good" | "careful" | "stay" {
  if (level === "good to go") return "good";
  if (level === "stay in") return "stay";
  return "careful";
}

export function verdictEmoji(level: VerdictLevel): string {
  if (level === "good to go") return "☀";
  if (level === "stay in") return "⌂";
  return "☁";
}

export function aqiBand(aqi: number | null): string {
  if (aqi == null) return "unknown";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

export function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
