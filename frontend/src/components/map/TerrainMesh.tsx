import { useEffect, useMemo } from "react";
import * as THREE from "three";

import {
  MAX_ELEVATION,
  MAP_LAYOUT,
  WORLD_DEPTH,
  lonLatToWorld,
  reliefFor,
  sampleElevation,
  toColourTexture,
  toHeightTexture,
  toIdTexture,
  type HeightField,
  type MapData,
  type RegionData,
} from "@/components/map/mapData";
import { terrainFragmentShader, terrainVertexShader } from "@/components/map/terrainShader";

export type TerrainUniforms = {
  uHeight: { value: THREE.Texture | null };
  uColour: { value: THREE.Texture | null };
  uIds: { value: THREE.Texture | null };
  uHeightRect: { value: THREE.Vector4 };
  uHeightTexel: { value: THREE.Vector2 };
  uIdTexel: { value: THREE.Vector2 };
  uWorldSize: { value: THREE.Vector2 };
  uBackground: { value: THREE.Color };
  uSun: { value: THREE.Vector3 };
  uRelief: { value: number };
  uSelectedId: { value: number };
  uHoverId: { value: number };
  uStateGlow: { value: number };
};

/** Directional sun: north-west and fairly low, for long readable ridges. */
export const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.72, -0.42).normalize();

function createUniforms(
  height: THREE.Texture,
  colour: THREE.Texture,
  ids: THREE.Texture,
  heightRect: THREE.Vector4,
  heightSize: { width: number; height: number },
  idSize: { width: number; height: number },
  background: THREE.Color,
): TerrainUniforms {
  return {
    uHeight: { value: height },
    uColour: { value: colour },
    uIds: { value: ids },
    uHeightRect: { value: heightRect },
    uHeightTexel: { value: new THREE.Vector2(1 / heightSize.width, 1 / heightSize.height) },
    uIdTexel: { value: new THREE.Vector2(1 / idSize.width, 1 / idSize.height) },
    uWorldSize: { value: new THREE.Vector2(MAP_LAYOUT.worldWidth, WORLD_DEPTH) },
    uBackground: { value: background },
    uSun: { value: SUN_DIRECTION.clone() },
    uRelief: { value: 9 },
    uSelectedId: { value: 0 },
    uHoverId: { value: 0 },
    uStateGlow: { value: 0 },
  };
}

function sampleFieldUv(field: HeightField, u: number, v: number): number {
  const x = Math.min(field.width - 1, Math.max(0, u * field.width - 0.5));
  const y = Math.min(field.height - 1, Math.max(0, v * field.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = field.data[y0 * field.width + x0] ?? 0;
  const b = field.data[y0 * field.width + x1] ?? 0;
  const c = field.data[y1 * field.width + x0] ?? 0;
  const d = field.data[y1 * field.width + x1] ?? 0;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

type GridOptions = {
  columns: number;
  rows: number;
  /** Scene-space position for a normalised grid coordinate. */
  worldAt: (u: number, v: number) => { x: number; z: number };
  /** Terrain height in scene units. */
  heightAt: (u: number, v: number) => number;
};

function buildGrid({ columns, rows, worldAt, heightAt }: GridOptions): THREE.BufferGeometry {
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((columns + 1) * (rows + 1) * 2);
  const indices = new Uint32Array(columns * rows * 6);

  let p = 0;
  let t = 0;
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const { x, z } = worldAt(u, v);
      positions[p] = x;
      positions[p + 1] = heightAt(u, v);
      positions[p + 2] = z;
      p += 3;
      uvs[t] = u;
      uvs[t + 1] = v;
      t += 2;
    }
  }

  let i = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices[i] = a;
      indices[i + 1] = c;
      indices[i + 2] = b;
      indices[i + 3] = b;
      indices[i + 4] = c;
      indices[i + 5] = d;
      i += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function TerrainMesh({
  data,
  region,
  background,
  selectedId,
  hoverId,
  quality,
}: {
  data: MapData;
  region: RegionData | null;
  background: string;
  selectedId: number;
  hoverId: number;
  quality: "high" | "low";
}) {
  const heightTexture = useMemo(() => toHeightTexture(data.height), [data]);
  const colourTexture = useMemo(() => toColourTexture(data.colours), [data]);
  const idTexture = useMemo(() => toIdTexture(data.ids), [data]);
  const regionTexture = useMemo(
    () => (region ? toHeightTexture(region.height) : null),
    [region],
  );

  useEffect(() => {
    return () => {
      heightTexture.dispose();
      colourTexture.dispose();
      idTexture.dispose();
    };
  }, [heightTexture, colourTexture, idTexture]);

  useEffect(() => {
    return () => regionTexture?.dispose();
  }, [regionTexture]);

  // Colours arrive as sRGB from CSS; three's Color would otherwise convert
  // them into linear working space and the paper ocean would disagree with
  // the page behind the canvas.
  const backgroundColour = useMemo(() => {
    const channels = background.match(/[\d.]+/g)?.map(Number) ?? [242, 242, 242];
    return new THREE.Color(
      Math.min(1, (channels[0] ?? 242) / 255),
      Math.min(1, (channels[1] ?? 242) / 255),
      Math.min(1, (channels[2] ?? 242) / 255),
    );
  }, [background]);

  const columns = quality === "high" ? 512 : 320;
  const rows = quality === "high" ? 232 : 145;

  const worldGeometry = useMemo(() => {
    return buildGrid({
      columns,
      rows,
      worldAt: (u, v) => ({
        x: (u - 0.5) * MAP_LAYOUT.worldWidth,
        z: (v - 0.5) * WORLD_DEPTH,
      }),
      heightAt: (u, v) => {
        const lon = MAP_LAYOUT.lonMin + u * 360;
        const lat = MAP_LAYOUT.latTop - v * (MAP_LAYOUT.latTop - MAP_LAYOUT.latBottom);
        return reliefFor(sampleElevation(data.height, lon, lat) / MAX_ELEVATION);
      },
    });
  }, [columns, rows, data]);

  useEffect(() => () => worldGeometry.dispose(), [worldGeometry]);

  const worldMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: terrainVertexShader,
        fragmentShader: terrainFragmentShader,
        uniforms: createUniforms(
          heightTexture,
          colourTexture,
          idTexture,
          new THREE.Vector4(
            -MAP_LAYOUT.worldWidth / 2,
            -WORLD_DEPTH / 2,
            MAP_LAYOUT.worldWidth,
            WORLD_DEPTH,
          ),
          { width: data.height.width, height: data.height.height },
          { width: data.ids.width, height: data.ids.height },
          backgroundColour,
        ),
      }),
    [heightTexture, colourTexture, idTexture, data, backgroundColour],
  );

  useEffect(() => () => worldMaterial.dispose(), [worldMaterial]);

  useEffect(() => {
    worldMaterial.uniforms["uSelectedId"]!.value = selectedId;
    worldMaterial.uniforms["uHoverId"]!.value = hoverId;
  }, [worldMaterial, selectedId, hoverId]);

  useEffect(() => {
    const uniform = worldMaterial.uniforms["uBackground"];
    if (uniform) uniform.value = backgroundColour;
  }, [worldMaterial, backgroundColour]);

  const regionColumns = quality === "high" ? 224 : 160;
  const regionRows = regionColumns;

  const regionGeometry = useMemo(() => {
    if (!region) return null;
    const { bounds } = region;
    return buildGrid({
      columns: regionColumns,
      rows: regionRows,
      worldAt: (u, v) => {
        const lon = bounds.minLon + u * (bounds.maxLon - bounds.minLon);
        const lat = bounds.maxLat - v * (bounds.maxLat - bounds.minLat);
        return lonLatToWorld(lon, lat);
      },
      heightAt: (u, v) => {
        const lon = bounds.minLon + u * (bounds.maxLon - bounds.minLon);
        const lat = bounds.maxLat - v * (bounds.maxLat - bounds.minLat);
        const detail = reliefFor(sampleElevation(region.height, lon, lat) / MAX_ELEVATION);
        const coarse = reliefFor(sampleElevation(data.height, lon, lat) / MAX_ELEVATION);
        // Feather to the global field at the patch edge so the two surfaces meet.
        const edge = Math.min(u, 1 - u, v, 1 - v);
        const blend = Math.min(1, Math.max(0, edge / 0.06));
        return coarse * (1 - blend) + detail * blend + 0.008;
      },
    });
  }, [region, data, regionColumns, regionRows]);

  useEffect(() => () => regionGeometry?.dispose(), [regionGeometry]);

  const regionMaterial = useMemo(() => {
    if (!region || !regionTexture || !regionGeometry) return null;
    const a = lonLatToWorld(region.bounds.minLon, region.bounds.maxLat);
    const b = lonLatToWorld(region.bounds.maxLon, region.bounds.minLat);
    const material = new THREE.ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      uniforms: createUniforms(
        regionTexture,
        colourTexture,
        idTexture,
        new THREE.Vector4(a.x, a.z, b.x - a.x, b.z - a.z),
        { width: region.height.width, height: region.height.height },
        { width: data.ids.width, height: data.ids.height },
        backgroundColour,
      ),
    });
    material.uniforms["uStateGlow"]!.value = 1;
    return material;
  }, [region, regionTexture, regionGeometry, colourTexture, idTexture, data, backgroundColour]);

  useEffect(() => () => regionMaterial?.dispose(), [regionMaterial]);

  useEffect(() => {
    if (!regionMaterial) return;
    regionMaterial.uniforms["uSelectedId"]!.value = selectedId;
    regionMaterial.uniforms["uHoverId"]!.value = hoverId;
  }, [regionMaterial, selectedId, hoverId]);

  useEffect(() => {
    if (!regionMaterial) return;
    const uniform = regionMaterial.uniforms["uBackground"];
    if (uniform) uniform.value = backgroundColour;
  }, [regionMaterial, backgroundColour]);

  return (
    <group>
      <mesh geometry={worldGeometry} material={worldMaterial} frustumCulled={false} />
      {regionGeometry && regionMaterial && (
        <mesh geometry={regionGeometry} material={regionMaterial} frustumCulled={false} />
      )}
    </group>
  );
}
