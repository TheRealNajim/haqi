import { useMemo, useState } from "react";
import type { WhyEdge, WhyNode, WhyPayload } from "@/types";
import { verdictTone } from "@/lib/verdict";
import "./EvidenceGraph.css";

interface Props {
  why: WhyPayload;
}

interface LaidOutNode extends WhyNode {
  x: number;
  y: number;
  r: number;
}

function layoutNodes(nodes: WhyNode[]): LaidOutNode[] {
  const verdict = nodes.find((n) => n.id === "verdict" || n.type === "verdict");
  const others = nodes.filter((n) => n !== verdict);
  const cx = 320;
  const cy = 210;
  const radius = 150;

  const laid: LaidOutNode[] = [];
  if (verdict) {
    laid.push({
      ...verdict,
      x: cx,
      y: cy,
      r: 42,
    });
  }

  others.forEach((node, i) => {
    const angle = (-Math.PI / 2) + (i * (2 * Math.PI)) / Math.max(others.length, 1);
    const r = 18 + node.weight * 22;
    laid.push({
      ...node,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * (radius * 0.78),
      r,
    });
  });

  return laid;
}

function edgePath(
  from: LaidOutNode,
  to: LaidOutNode,
): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 - 18;
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
}

function kindLabel(node: WhyNode): string {
  if (node.kind) return node.kind;
  if (node.type === "forecast") return "forecast";
  if (node.type === "verdict") return "assessment";
  return "observation";
}

export function EvidenceGraph({ why }: Props) {
  const nodes = useMemo(() => layoutNodes(why.nodes), [why.nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [selectedId, setSelectedId] = useState<string>(
    nodes.find((n) => n.type === "verdict")?.id ?? nodes[0]?.id ?? "",
  );
  const selected = byId.get(selectedId) ?? nodes[0];
  const tone = verdictTone(why.decision.level);

  return (
    <div className="evidence-graph">
      <div className="evidence-graph__stage panel">
        <svg
          className="evidence-graph__svg"
          viewBox="0 0 640 420"
          role="img"
          aria-label="Evidence graph for today's air quality verdict"
        >
          <title>Evidence graph</title>
          {why.edges.map((edge: WhyEdge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            const stale = from.stale || to.stale;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path
                  d={edgePath(from, to)}
                  className={
                    stale
                      ? "evidence-graph__edge evidence-graph__edge--stale"
                      : "evidence-graph__edge"
                  }
                />
              </g>
            );
          })}

          {nodes.map((node) => {
            const isVerdict = node.type === "verdict" || node.id === "verdict";
            const isSelected = node.id === selected?.id;
            const classes = [
              "evidence-graph__node",
              node.stale ? "is-stale" : "",
              isVerdict ? `is-verdict is-verdict--${tone}` : "",
              isSelected ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <g key={node.id} className={classes}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${node.label}: ${node.finding}`}
                  onClick={() => setSelectedId(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(node.id);
                    }
                  }}
                />
                <text
                  x={node.x}
                  y={node.y + node.r + 16}
                  textAnchor="middle"
                  className="evidence-graph__label"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="evidence-graph__legend">
          Bigger circle = more weight. Gray dashed = stale (counted less).
        </p>
      </div>

      <aside className="evidence-graph__detail panel" aria-live="polite">
        {selected ? (
          <>
            <p className="evidence-graph__kicker">{kindLabel(selected)}</p>
            <h2>{selected.label}</h2>
            <p className="evidence-graph__finding">{selected.finding}</p>
            <dl className="evidence-graph__meta">
              <div>
                <dt>Weight</dt>
                <dd>{Math.round(selected.weight * 100)}%</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{selected.stale ? "Stale — counted less" : "Fresh enough"}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{selected.type}</dd>
              </div>
            </dl>
            {selected.source_url ? (
              <p>
                <a href={selected.source_url} target="_blank" rel="noreferrer">
                  Source link
                </a>
              </p>
            ) : (
              <p className="evidence-graph__muted">No public source link for this node.</p>
            )}
            <p className="evidence-graph__note">
              {why.edges
                .filter((e) => e.from === selected.id || e.to === selected.id)
                .map((e) => e.note)
                .join(" · ") || "Part of today's evidence chain."}
            </p>
          </>
        ) : (
          <p>Tap a circle to read the evidence.</p>
        )}
      </aside>

      <ol className="evidence-graph__fallback">
        {why.nodes.map((node) => (
          <li key={`list-${node.id}`}>
            <button
              type="button"
              className={
                node.id === selected?.id
                  ? "evidence-graph__fallback-btn is-active"
                  : "evidence-graph__fallback-btn"
              }
              onClick={() => setSelectedId(node.id)}
            >
              <strong>{node.label}</strong>
              <span>
                {node.finding}
                {node.stale ? " (stale)" : ""}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
