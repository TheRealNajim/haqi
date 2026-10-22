import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchToday } from "@/api";
import { BlindSpots } from "@/components/BlindSpots";
import { PixelCard } from "@/components/PixelCard";
import { VerdictCard } from "@/components/VerdictCard";
import { aqiBand, formatWhen } from "@/lib/verdict";
import type { TodayPayload } from "@/types";
import "./Today.css";

export function TodayPage() {
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchToday()
      .then((data) => {
        if (alive) setToday(data);
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err.message : "Could not load today.");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!today) {
    return <p className="page-lede">Loading today's air check…</p>;
  }

  return (
    <div className="today-page">
      <header className="page-head">
        <p className="page-kicker">Today</p>
        <h1 className="page-title">{today.location.name}</h1>
        <p className="page-lede">
          Observed {formatWhen(today.observed_at)}.{" "}
          <span className="today-note">{today.location.note}</span>
        </p>
      </header>

      <div className="today-layout">
        <div className="today-layout__primary">
          <VerdictCard
            verdict={{
              level: today.level,
              window: today.window,
              reason: today.reason,
              aqi: today.aqi,
              smallPrint: today.recommendation,
              ledgerId: today.ledger_id,
            }}
            whyHref={`/why${today.ledger_id ? `?ledger=${today.ledger_id}` : ""}`}
          />

          <section className="today-aqi panel" aria-label="AQI scale">
            <h2>AQI scale</h2>
            <p className="today-aqi__value">
              <strong>{today.aqi ?? "—"}</strong>
              <span>{aqiBand(today.aqi)}</span>
            </p>
            <div
              className="today-aqi__meter"
              role="img"
              aria-label={`AQI ${today.aqi} on a 0 to 300 scale`}
            >
              <div
                className="today-aqi__needle"
                style={{
                  left: `${Math.min(100, Math.max(0, ((today.aqi ?? 0) / 300) * 100))}%`,
                }}
              />
            </div>
            <ol className="today-aqi__bands">
              <li>0–50 Good</li>
              <li>51–100 Moderate</li>
              <li>101+ Unhealthy range</li>
            </ol>
          </section>
        </div>

        <aside className="today-layout__side">
          <section className="today-pollutants panel">
            <h2>Measurements</h2>
            <ul>
              {today.pollutants.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.label}
                    <small>{p.kind}</small>
                  </span>
                  <strong>
                    {p.value} {p.unit}
                  </strong>
                </li>
              ))}
            </ul>
            <p className="today-pollutants__hint">
              Observations are readings. Forecasts are predictions — not proven causes.
            </p>
          </section>

          <p className="today-why-link">
            Curious how we got here?{" "}
            <Link to={`/why${today.ledger_id ? `?ledger=${today.ledger_id}` : ""}`}>
              Open the evidence graph
            </Link>
          </p>
        </aside>
      </div>

      <BlindSpots items={today.blind_spots} />

      <div className="today-share">
        <PixelCard today={today} />
      </div>
    </div>
  );
}
