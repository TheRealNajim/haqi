import { useState } from "react";
import { Eye, ExternalLink, GitBranch, Info, TriangleAlert } from "lucide-react";

import { WHY_FIXTURE, WHY_SNAPSHOT, type WhyNode } from "@/data/why";
import { K, canvasPosition } from "@/lib/canvas";

type WhyPageProps = {
  desktop: boolean;
  onViewFullMap: () => void;
};

const pos = (desktop: boolean, left: number, top: number, width: number, height: number) =>
  canvasPosition(desktop, left, top, width, height);

const autoPos = (desktop: boolean, left: number, top: number, width: number, maxHeight: number) =>
  desktop
    ? {
        position: "absolute" as const,
        left: left * K,
        top: top * K,
        width: width * K,
        maxHeight: maxHeight * K,
      }
    : undefined;

/** Fixed graph positions keep the fixture legible without a layout engine. */
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  verdict: { x: 50, y: 50 },
  "openaq:demo": { x: 18, y: 24 },
  "weather:demo": { x: 82, y: 24 },
  "school:demo": { x: 18, y: 79 },
};

function positionFor(node: WhyNode, index: number) {
  return (
    NODE_POSITIONS[node.id] ?? {
      x: 22 + ((index * 27) % 56),
      y: 20 + ((index * 29) % 60),
    }
  );
}

function levelTone(level: string) {
  const value = level.toLowerCase();
  if (value.includes("avoid") || value.includes("stay in")) return "bg-risk-red-soft text-risk-red";
  if (value.includes("careful")) return "bg-risk-orange-soft text-risk-orange";
  if (value.includes("good") || value.includes("ok")) return "bg-risk-green/15 text-risk-green";
  return "bg-risk-teal/15 text-risk-teal";
}

function typeLabel(type: WhyNode["type"]) {
  if (type === "verdict") return "Verdict";
  if (type === "forecast") return "Forecast";
  return "Station";
}

function NodeDetail({ node }: { node: WhyNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-ink-faint">
          {typeLabel(node.type)}
        </span>
        {node.stale && (
          <span className="rounded-full bg-risk-orange-soft px-2 py-0.5 text-[10px] text-risk-orange">
            Stale · down-weighted
          </span>
        )}
      </div>
      <h3 className="mt-2 font-display text-[24px] leading-[1.25] text-ink">{node.label}</h3>
      <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">{node.finding}</p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-ink-faint">
          <span>Weight in this answer</span>
          <span className="text-ink">{Math.round(node.weight * 100)}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
          <div
            className={`h-full rounded-full ${node.stale ? "bg-ink-faint" : "bg-ink"}`}
            style={{ width: `${Math.min(100, node.weight * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3 text-[12px] text-ink-faint">
        {node.source_url ? (
          <a
            href={node.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-ink-soft underline decoration-border underline-offset-4 hover:text-ink"
          >
            {node.source_url.replace(/^https?:\/\//, "")}
            <ExternalLink className="size-3" strokeWidth={1.8} />
          </a>
        ) : (
          "No public source attached to this node."
        )}
      </div>
    </div>
  );
}

export function WhyPage({ desktop, onViewFullMap }: WhyPageProps) {
  const [selectedId, setSelectedId] = useState("verdict");
  const selected =
    WHY_FIXTURE.nodes.find((node) => node.id === selectedId) ?? WHY_FIXTURE.nodes[0]!;
  const edgeFor = (node: WhyNode) =>
    WHY_FIXTURE.edges.find((edge) => edge.from === node.id && edge.to === "verdict");
  const decisionTone = levelTone(WHY_FIXTURE.decision.level);

  return (
    <div className={desktop ? "contents" : "relative"}>
      <div
        style={desktop ? pos(true, 119, 112, 1040, 96) : undefined}
        className={desktop ? "" : "mt-6"}
      >
        <h1 className="font-display text-[42px] leading-[1.2] tracking-[-0.01em] text-ink">Why?</h1>
        <p className="mt-1 text-[17px] leading-[1.45] text-ink-soft">
          Follow the evidence behind today&apos;s answer — including what the demo could not check.
        </p>
      </div>

      <button
        type="button"
        onClick={onViewFullMap}
        style={desktop ? pos(true, 1729, 141, 160, 48) : undefined}
        className={`flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-ink text-[16px] text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
          desktop ? "" : "mt-4 h-10 px-5"
        }`}
      >
        View Full Map <Eye className="size-5" strokeWidth={1.6} />
      </button>

      <section
        style={desktop ? pos(true, 119, 250, 1060, 720) : undefined}
        className={`rounded-[18px] border border-border bg-surface shadow-[var(--shadow-soft)] ${
          desktop ? "" : "mt-5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              <GitBranch className="size-3.5" strokeWidth={1.7} />
              Evidence chain
            </h2>
            <p className="mt-1 text-[19px] leading-tight text-ink">
              &ldquo;{WHY_FIXTURE.question}&rdquo;
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[12px] ${decisionTone}`}>
            {WHY_FIXTURE.decision.level}
          </span>
        </div>

        <div className="px-5 pb-5 pt-4 sm:px-6">
          <div className="relative h-[380px] sm:h-[440px]">
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              {WHY_FIXTURE.nodes
                .filter((node) => node.type !== "verdict")
                .map((node) => {
                  const from = positionFor(
                    node,
                    WHY_FIXTURE.nodes.findIndex((item) => item.id === node.id),
                  );
                  const edge = edgeFor(node);
                  return (
                    <line
                      key={node.id}
                      x1={from.x}
                      y1={from.y}
                      x2={50}
                      y2={50}
                      stroke={node.stale ? "var(--ink-faint)" : "var(--border)"}
                      strokeWidth={node.stale ? 1.2 : 1.4}
                      strokeDasharray={node.stale ? "4 4" : undefined}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{edge?.note ?? "evidence"}</title>
                    </line>
                  );
                })}
            </svg>

            {WHY_FIXTURE.nodes.map((node, index) => {
              const place = positionFor(node, index);
              const verdict = node.type === "verdict";
              const diameter = verdict
                ? desktop
                  ? 164
                  : 124
                : (desktop ? 94 : 78) + node.weight * 54;
              const active = selected.id === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  aria-pressed={active}
                  aria-label={`${node.label} — ${node.finding}`}
                  title={node.finding}
                  style={{
                    left: `${place.x}%`,
                    top: `${place.y}%`,
                    width: diameter,
                    height: diameter,
                    transform: "translate(-50%, -50%)",
                  }}
                  className={`absolute flex flex-col items-center justify-center rounded-full border p-2 text-center transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    verdict
                      ? "bg-ink text-surface"
                      : node.stale
                        ? "border-dashed border-ink-faint/70 bg-canvas text-ink-faint"
                        : "border-border bg-canvas text-ink"
                  } ${
                    active
                      ? "shadow-[0_0_0_3px_var(--surface),0_0_0_5px_var(--ink)]"
                      : "hover:border-ink/40"
                  }`}
                >
                  <span
                    className={`text-[9px] uppercase tracking-[0.1em] ${
                      verdict ? "text-surface/70" : "text-ink-faint"
                    }`}
                  >
                    {typeLabel(node.type)}
                  </span>
                  <span
                    className={`mt-0.5 max-w-full leading-[1.15] ${
                      verdict ? "text-[15px]" : "text-[11px]"
                    }`}
                  >
                    {node.label}
                  </span>
                  <span
                    className={`mt-1 text-[10px] ${verdict ? "text-surface/70" : "text-ink-faint"}`}
                  >
                    {Math.round(node.weight * 100)}%
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-ink" /> Counted
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-px w-4 border-t border-dashed border-ink-faint" /> Down-weighted
            </span>
            <span>Tap a node to inspect it.</span>
            <span className="ml-auto">Demo fixture · not live data</span>
          </div>
        </div>
      </section>

      <section
        style={desktop ? autoPos(true, 1210, 250, 637, 260) : undefined}
        className={`rounded-[18px] border border-border bg-surface p-5 shadow-[var(--shadow-soft)] ${
          desktop ? "" : "mt-4"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              Today&apos;s call
            </p>
            <h2 className="mt-1 font-display text-[27px] leading-tight text-ink">
              {WHY_FIXTURE.decision.level}
            </h2>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] ${decisionTone}`}>
            AQI {WHY_FIXTURE.decision.aqi}
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-[1.55] text-ink-soft">
          {WHY_FIXTURE.decision.reason}
        </p>
        <p className="mt-2 text-[13px] text-ink">
          <span className="text-ink-faint">Best window: </span>
          {WHY_FIXTURE.decision.window}
        </p>
      </section>

      <section
        style={desktop ? autoPos(true, 1210, 555, 637, 360) : undefined}
        className={`rounded-[18px] border border-border bg-surface p-5 shadow-[var(--shadow-soft)] ${
          desktop ? "" : "mt-4"
        }`}
      >
        <p className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">Node detail</p>
        <div className="mt-2">
          <NodeDetail node={selected} />
        </div>
      </section>

      <section
        style={desktop ? autoPos(true, 1210, 940, 637, 230) : undefined}
        className={`rounded-[18px] border border-risk-orange/40 bg-risk-orange-soft/60 p-5 ${
          desktop ? "" : "mt-4"
        }`}
      >
        <div className="flex items-center gap-2 text-ink">
          <TriangleAlert className="size-4 text-risk-orange" strokeWidth={1.7} />
          <h2 className="text-[15px]">Blind spots</h2>
        </div>
        <ul className="mt-2 space-y-2">
          {WHY_FIXTURE.blind_spots.map((spot) => (
            <li key={spot} className="text-[12px] leading-[1.55] text-ink-soft">
              {spot}
            </li>
          ))}
        </ul>
      </section>

      <div
        style={desktop ? autoPos(true, 119, 1000, 1060, 60) : undefined}
        className={`text-[11px] leading-[1.5] text-ink-faint ${desktop ? "" : "mt-4"}`}
      >
        <span className="inline-flex max-w-full items-start gap-2 rounded-[10px] border border-border bg-surface px-3 py-2">
          <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.6} />
          <span>
            Logged from {WHY_FIXTURE.ledger_id} on {WHY_SNAPSHOT}. Node size shows weight; stale
            evidence is dashed and down-weighted.
          </span>
        </span>
      </div>
    </div>
  );
}
