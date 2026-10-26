import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  MAP_LAYOUT,
  WORLD_DEPTH,
  lonLatToWorld,
  pointInRings,
  worldToLonLat,
  type CountryRecord,
  type MapData,
  type MapSelection,
  type StateRecord,
} from "@/components/map/mapData";

export function countrySelection(country: CountryRecord): MapSelection {
  return {
    kind: "country",
    // Numeric ids are unique even where Natural Earth has no ISO code (-99).
    id: `c${country.id}`,
    name: country.name,
    country: country.name,
    lon: country.lon,
    lat: country.lat,
    bbox: country.bbox,
    continent: country.continent,
  };
}

export function stateSelection(state: StateRecord): MapSelection {
  return {
    kind: "state",
    id: state.code,
    name: state.name,
    country: "Nigeria",
    lon: state.lon,
    lat: state.lat,
    bbox: [state.bbox.minLon, state.bbox.minLat, state.bbox.maxLon, state.bbox.maxLat],
    continent: "Africa",
  };
}

function countryAt(data: MapData, u: number, v: number): CountryRecord | null {
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const x = Math.min(data.ids.width - 1, Math.max(0, Math.floor(u * data.ids.width)));
  const y = Math.min(data.ids.height - 1, Math.max(0, Math.floor(v * data.ids.height)));
  const id = data.ids.data[(y * data.ids.width + x) * 4] ?? 0;
  return data.byId.get(id) ?? null;
}

function stateAt(states: StateRecord[] | null, lon: number, lat: number): StateRecord | null {
  if (!states) return null;
  for (const state of states) {
    const { minLon, maxLon, minLat, maxLat } = state.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    if (pointInRings(state.rings, lon, lat)) return state;
  }
  return null;
}

/**
 * Picking happens against the flat map plane rather than the displaced mesh:
 * cheap, stable across neighbouring triangles, and free of flicker.
 */
export function MapInteraction({
  data,
  states,
  onHover,
  onPick,
}: {
  data: MapData;
  states: StateRecord[] | null;
  onHover: (selection: MapSelection | null) => void;
  onPick: (selection: MapSelection | null) => void;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const lastKey = useRef<string>("");

  useEffect(() => {
    const element = gl.domElement;
    const pointer = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;
    let frame = 0;

    const resolve = (event: PointerEvent): MapSelection | null => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(plane, point)) return null;

      const u = point.x / MAP_LAYOUT.worldWidth + 0.5;
      const v = point.z / WORLD_DEPTH + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;

      const { lon, lat } = worldToLonLat(point.x, point.z);
      const state = stateAt(states, lon, lat);
      if (state) return stateSelection(state);

      const country = countryAt(data, u, v);
      return country ? countrySelection(country) : null;
    };

    const emitHover = (event: PointerEvent) => {
      const selection = resolve(event);
      const key = selection ? `${selection.kind}:${selection.id}` : "";
      if (key !== lastKey.current) {
        lastKey.current = key;
        onHover(selection);
        invalidate();
      }
      element.style.cursor = selection ? "pointer" : "grab";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        emitHover(event);
      });
    };

    const onPointerLeave = () => {
      lastKey.current = "";
      onHover(null);
      invalidate();
      element.style.cursor = "grab";
    };

    const onPointerDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      downAt = null;
      if (moved > 7 || event.button !== 0) return;
      const selection = resolve(event);
      onPick(selection);
    };

    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerleave", onPointerLeave);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointerup", onPointerUp);
    element.style.touchAction = "none";

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerleave", onPointerLeave);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, data, gl, invalidate, onHover, onPick, plane, point, raycaster, states]);

  return null;
}

/** Scene-space anchor for a label, lifted just above the terrain. */
export function selectionAnchor(selection: MapSelection, height: number) {
  const { x, z } = lonLatToWorld(selection.lon, selection.lat);
  return new THREE.Vector3(x, height, z);
}
