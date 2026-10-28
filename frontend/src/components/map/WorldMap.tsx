import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import worldMap from "@/assets/world-map.jpg";
import { WorldMapCanvas } from "@/components/map/WorldMapCanvas";
import type { AqiMarker } from "@/components/map/MapLayers";
import { loadMapData, type MapData, type MapSelection } from "@/components/map/mapData";

export type { AqiMarker, MapSelection };

export type WorldMapProps = {
  /** Currently focused country or Nigerian state. */
  selected: MapSelection | null;
  onSelect: (selection: MapSelection | null) => void;
  /** Live air-quality markers. Fixture data must arrive with `demo: true`. */
  markers?: AqiMarker[];
  /** Show the air-quality overlay layer (on by default, no chrome control). */
  overlay?: boolean;
  /** Zoom factor for framing a selected country or state. */
  focusZoom?: number;
  /** Expanded, full-screen presentation. The same canvas is reused. */
  immersive?: boolean;
  onImmersiveChange?: (immersive: boolean) => void;
  className?: string;
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

export function WorldMap({
  selected,
  onSelect,
  markers = [],
  overlay = true,
  focusZoom = 1,
  immersive = false,
  onImmersiveChange,
  className = "",
}: WorldMapProps) {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2") ?? probe.getContext("webgl");
    setWebgl(Boolean(context));
  }, []);

  useEffect(() => {
    if (webgl === false) return;
    let alive = true;
    setError(null);
    loadMapData()
      .then((next) => {
        if (alive) setData(next);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : "The map data could not be loaded.");
      });
    return () => {
      alive = false;
    };
  }, [webgl, attempt]);

  const showCanvas = webgl !== false && data && !error;

  const handleSelect = useCallback(
    (next: MapSelection | null) => {
      onSelect(next);
    },
    [onSelect],
  );

  return (
    <section
      aria-label={immersive ? "Full air-quality map" : "Interactive relief map"}
      aria-roledescription="3D map"
      role={immersive ? "dialog" : undefined}
      aria-modal={immersive || undefined}
      className={`relative h-full w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:ring-inset ${className}`}
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className={`absolute inset-0 ${immersive ? "map-launch" : ""}`}>
        {showCanvas && data ? (
          <WorldMapCanvas
            data={data}
            region={null}
            states={null}
            background="#ffffff"
            selected={selected}
            markers={markers}
            overlay={overlay}
            focusZoom={focusZoom}
            reducedMotion={reducedMotion}
            quality="high"
            zoom={null}
            interactive={immersive}
            onPick={handleSelect}
          />
        ) : null}

        {(webgl === false || error) && (
          <div className="absolute inset-0">
            <img
              src={worldMap}
              alt="Relief map of the world"
              className="absolute inset-0 h-full w-full scale-[1.08] object-cover"
            />
          </div>
        )}
      </div>

      {/* Loading / failure surfaces */}
      {webgl === null && (
        <span className="absolute inset-0 flex items-center justify-center text-ink-soft">
          Checking this browser's 3D support…
        </span>
      )}
      {webgl === true && !data && !error && (
        <span className="absolute inset-0 flex items-center justify-center text-ink-soft">
          Sculpting the relief map…
        </span>
      )}
      {error && (
        <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-[10px] border border-border bg-surface/95 px-4 py-3 text-[13px] text-ink shadow-[var(--shadow-soft)]">
          <span>The 3D map could not load.</span>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="rounded-full border border-border px-3 py-1 text-[12px] hover:bg-canvas"
          >
            Try again
          </button>
        </div>
      )}

      {/* The only chrome: leaving full screen. */}
      {immersive && (
        <button
          type="button"
          onClick={() => onImmersiveChange?.(false)}
          aria-label="Exit full map"
          title="Exit full map"
          className="absolute z-50 flex size-12 items-center justify-center rounded-full border border-border bg-surface/95 text-ink shadow-[var(--shadow-soft)] backdrop-blur transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          style={{
            top: "max(1rem, env(safe-area-inset-top))",
            right: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          <X className="size-5" strokeWidth={1.8} />
        </button>
      )}
    </section>
  );
}

// Simplified status display
function StatusText({ label }: { label: string }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center text-ink-soft">{label}</span>
  );
}
