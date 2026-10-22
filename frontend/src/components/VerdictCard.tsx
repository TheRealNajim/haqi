import { Link } from "react-router-dom";
import type { VerdictCardModel } from "@/types";
import { aqiBand, verdictTone } from "@/lib/verdict";
import "./VerdictCard.css";

interface Props {
  verdict: VerdictCardModel;
  whyHref?: string;
  compact?: boolean;
}

export function VerdictCard({ verdict, whyHref = "/why", compact = false }: Props) {
  const tone = verdictTone(verdict.level);

  return (
    <article
      className={`verdict-card verdict-card--${tone}${compact ? " verdict-card--compact" : ""}`}
      aria-label={`Verdict: ${verdict.level}`}
    >
      <div className="verdict-card__top">
        <span className={`verdict-chip verdict-chip--${tone}`}>{verdict.level}</span>
        {verdict.aqi != null ? (
          <p className="verdict-card__aqi">
            <span className="verdict-card__aqi-num">{verdict.aqi}</span>
            <span className="verdict-card__aqi-meta">
              AQI · {aqiBand(verdict.aqi)}
            </span>
          </p>
        ) : null}
      </div>

      <p className="verdict-card__reason">{verdict.reason}</p>

      <p className="verdict-card__window">
        <span className="verdict-card__window-label">Best window</span>
        <span className="verdict-card__window-value">{verdict.window}</span>
      </p>

      {verdict.smallPrint ? (
        <p className="verdict-card__print">{verdict.smallPrint}</p>
      ) : null}

      <div className="verdict-card__actions">
        <Link className="verdict-card__why" to={whyHref}>
          See why →
        </Link>
      </div>
    </article>
  );
}
