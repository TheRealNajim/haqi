import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";

import { MapCamera } from "@/components/map/MapCamera";
import { MapInteraction, countrySelection, stateSelection } from "@/components/map/MapInteraction";
import {
  AirQualityLayer,
  HoverLabel,
  StateBorders,
  type AqiMarker,
} from "@/components/map/MapLayers";
import { TerrainMesh } from "@/components/map/TerrainMesh";
import type { MapData, MapSelection, RegionData, StateRecord } from "@/components/map/mapData";

function Invalidator({ values }: { values: unknown[] }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, values);
  return null;
}

function findCountryId(data: MapData, selection: MapSelection | null): number {
  if (!selection) return 0;
  const target =
    selection.kind === "state"
      ? data.countries.find((country) => country.iso3 === "NGA")
      : data.countries.find(
          (country) => `c${country.id}` === selection.id || country.name === selection.name,
        );
  return target?.id ?? 0;
}

export function WorldMapCanvas({
  data,
  region,
  states,
  background,
  selected,
  markers,
  overlay,
  focusZoom,
  reducedMotion,
  quality,
  zoom,
  interactive,
  onPick,
}: {
  data: MapData;
  region: RegionData | null;
  states: StateRecord[] | null;
  background: string;
  selected: MapSelection | null;
  markers: AqiMarker[];
  overlay: boolean;
  focusZoom: number;
  reducedMotion: boolean;
  quality: "high" | "low";
  zoom: { direction: -1 | 1; token: number } | null;
  /** Only the full-screen map responds to drags, pinches and wheel zoom. */
  interactive: boolean;
  onPick: (selection: MapSelection | null) => void;
}) {
  const [hovered, setHovered] = useState<MapSelection | null>(null);

  const selectedCountryId = useMemo(() => findCountryId(data, selected), [data, selected]);
  const hoveredCountryId = useMemo(
    () => (hovered?.kind === "country" ? findCountryId(data, hovered) : 0),
    [data, hovered],
  );

  const Nigeria = useMemo(
    () => data.countries.find((country) => country.iso3 === "NGA") ?? null,
    [data],
  );

  const showStates = Boolean(states) && selectedCountryId === (Nigeria?.id ?? -1);

  const hoveredState = useMemo(
    () =>
      hovered?.kind === "state"
        ? (states?.find((state) => state.code === hovered.id) ?? null)
        : null,
    [hovered, states],
  );
  const selectedState = useMemo(
    () =>
      selected?.kind === "state"
        ? (states?.find((state) => state.code === selected.id) ?? null)
        : null,
    [selected, states],
  );

  const field = region?.height ?? data.height;

  const onHover = useMemo(() => (selection: MapSelection | null) => setHovered(selection), []);
  const handlePick = useMemo(
    () => (selection: MapSelection | null) => {
      // Null is meaningful: clicking open ocean clears the selection.
      onPick(selection);
    },
    [onPick],
  );

  return (
    <Canvas
      flat
      linear
      dpr={[1, quality === "high" ? 1.75 : 1.3]}
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 20, near: 0.25, far: 900, position: [0, 160, 24] }}
      style={{
        width: "100%",
        height: "100%",
        touchAction: interactive ? "none" : "auto",
        pointerEvents: interactive ? "auto" : "none",
      }}
      aria-label="Interactive 3D relief map of the world"
      role="img"
    >
      <TerrainMesh
        data={data}
        region={region}
        background={background}
        selectedId={selectedCountryId}
        hoverId={hoveredCountryId}
        quality={quality}
      />

      {showStates && states && (
        <StateBorders states={states} field={field} highlight={hoveredState ?? selectedState} />
      )}

      <AirQualityLayer markers={markers} field={data.height} visible={overlay} />

      <HoverLabel selection={hovered} field={data.height} />

      <MapCamera
        selection={selected}
        reducedMotion={reducedMotion}
        zoom={zoom}
        focusZoom={focusZoom}
        interactive={interactive}
      />

      <MapInteraction
        data={data}
        states={showStates ? states : null}
        interactive={interactive}
        onHover={onHover}
        onPick={handlePick}
      />

      <Invalidator
        values={[
          hoveredCountryId,
          selectedCountryId,
          region,
          markers,
          overlay,
          background,
          showStates,
        ]}
      />
    </Canvas>
  );
}

export { countrySelection, stateSelection };
