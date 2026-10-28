import { useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import {
  MAX_ELEVATION,
  sampleElevation,
  lonLatToWorld,
  type HeightField,
  type MapSelection,
  type StateRecord,
} from "@/components/map/mapData";

export type AqiMarker = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** US AQI. Null is a real answer (no current reading), never zero. */
  aqi: number | null;
  level: string;
  observedAt: string | null;
  source: string;
  demo: boolean;
  /** The strongest evidence claim, e.g. "nearest station reads PM2.5 61 µg/m³". */
  detail?: string;
};

function heightAtField(field: HeightField, lon: number, lat: number) {
  return (sampleElevation(field, lon, lat) / MAX_ELEVATION) ** 1.35 * 9;
}

function ringSegments(states: StateRecord[], field: HeightField, lift: number): Float32Array {
  const positions: number[] = [];
  for (const state of states) {
    for (const ring of state.rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (!a || !b) continue;
        const pointA = lonLatToWorld(a[0], a[1]);
        const pointB = lonLatToWorld(b[0], b[1]);
        const heightA = heightAtField(field, a[0], a[1]);
        const heightB = heightAtField(field, b[0], b[1]);
        positions.push(pointA.x, heightA + lift, pointA.z, pointB.x, heightB + lift, pointB.z);
      }
    }
  }
  return new Float32Array(positions);
}

export function StateBorders({
  states,
  field,
  highlight,
}: {
  states: StateRecord[];
  field: HeightField;
  highlight: StateRecord | null;
}) {
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.BufferAttribute(ringSegments(states, field, 0.035), 3),
    );
    return result;
  }, [states, field]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const highlighted = useMemo(
    () => (highlight ? ringSegments([highlight], field, 0.045) : null),
    [highlight, field],
  );

  const highlightGeometry = useMemo(() => {
    if (!highlighted) return null;
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(highlighted, 3));
    return result;
  }, [highlighted]);

  useEffect(() => () => highlightGeometry?.dispose(), [highlightGeometry]);

  return (
    <>
      <lineSegments geometry={geometry} renderOrder={2}>
        <lineBasicMaterial color="#4a463c" transparent opacity={0.34} depthWrite={false} />
      </lineSegments>
      {highlightGeometry && (
        <lineSegments geometry={highlightGeometry} renderOrder={3}>
          <lineBasicMaterial color="#26231c" transparent opacity={0.8} depthWrite={false} />
        </lineSegments>
      )}
    </>
  );
}

export function HoverLabel({
  selection,
  field,
}: {
  selection: MapSelection | null;
  field: HeightField;
}) {
  if (!selection) return null;
  const point = lonLatToWorld(selection.lon, selection.lat);
  const height = heightAtField(field, selection.lon, selection.lat) + 0.55;
  return (
    <Html
      position={[point.x, height, point.z]}
      center
      zIndexRange={[40, 10]}
      style={{ pointerEvents: "none" }}
    >
      <div className="-translate-y-2 whitespace-nowrap rounded-full border border-border bg-surface/95 px-3 py-1 text-[12px] leading-none text-ink shadow-[var(--shadow-soft)]">
        {selection.name}
        {selection.kind === "state" && <span className="ml-1.5 text-ink-faint">· Nigeria</span>}
      </div>
    </Html>
  );
}

const LEVEL_DOT: Record<string, string> = {
  "good to go": "bg-risk-green",
  "be careful": "bg-risk-orange",
  "stay in": "bg-risk-red",
};

const LEVEL_TEXT: Record<string, string> = {
  "good to go": "text-risk-green",
  "be careful": "text-risk-orange",
  "stay in": "text-risk-red",
};

export function AirQualityLayer({
  markers,
  field,
  visible,
}: {
  markers: AqiMarker[];
  field: HeightField;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <group>
      {markers.map((marker) => {
        const point = lonLatToWorld(marker.lon, marker.lat);
        const y = heightAtField(field, marker.lon, marker.lat) + 0.35;
        const dot = LEVEL_DOT[marker.level] ?? "bg-ink-faint";
        return (
          <group key={marker.id} position={[point.x, y, point.z]}>
            <mesh position={[0, 0.02, 0]}>
              <sphereGeometry args={[0.16, 12, 12]} />
              <meshBasicMaterial color="#2a2721" />
            </mesh>
            <mesh position={[0, 0.42, 0]}>
              <cylinderGeometry args={[0.022, 0.022, 0.8, 6]} />
              <meshBasicMaterial color="#2a2721" transparent opacity={0.55} />
            </mesh>
            <Html
              position={[0, 0.95, 0]}
              center
              zIndexRange={[50, 20]}
              style={{ pointerEvents: "none" }}
            >
              <div className="flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface/95 py-1 pl-2.5 pr-3 text-[12px] leading-none text-ink shadow-[var(--shadow-soft)]">
                <span aria-hidden className={`size-2 rounded-full ${dot}`} />
                <span className={`font-medium ${LEVEL_TEXT[marker.level] ?? "text-ink"}`}>
                  {marker.aqi === null ? "No value" : Math.round(marker.aqi)} ·{" "}
                  {marker.level || "no reading"}
                </span>
                {marker.demo && <span className="text-ink-faint">demo</span>}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
