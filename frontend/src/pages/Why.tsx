import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchToday, fetchWhy } from "@/api";
import { BlindSpots } from "@/components/BlindSpots";
import { EvidenceGraph } from "@/components/EvidenceGraph";
import type { WhyPayload } from "@/types";
import "./Why.css";

export function WhyPage() {
  const [params] = useSearchParams();
  const [why, setWhy] = useState<WhyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ledgerFromQuery = params.get("ledger");
        const today = await fetchToday();
        const ledgerId = ledgerFromQuery || today.ledger_id || "demo-ledger-0001";
        const data = await fetchWhy(ledgerId);
        if (alive) setWhy(data);
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "Could not load Why?");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [params]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!why) {
    return <p className="page-lede">Loading the evidence chain…</p>;
  }

  return (
    <div className="why-page">
      <header className="page-head">
        <p className="page-kicker">Why?</p>
        <h1 className="page-title">How we got to “{why.decision.level}”</h1>
        <p className="page-lede">
          {why.question ? (
            <>
              Question: <strong>{why.question}</strong>.{" "}
            </>
          ) : null}
          Tap a circle to read each clue. Bigger means it counted more.
        </p>
        <p className="why-back">
          <Link to="/today">← Back to Today</Link>
        </p>
      </header>

      <div className="why-summary panel">
        <p>
          <strong>{why.decision.level}</strong> · AQI {why.decision.aqi ?? "—"} ·{" "}
          {why.decision.window}
        </p>
        <p>{why.decision.reason}</p>
        {why.note ? <p className="why-summary__note">{why.note}</p> : null}
      </div>

      <EvidenceGraph why={why} />
      <BlindSpots items={why.blind_spots} />
    </div>
  );
}
