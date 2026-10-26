/**
 * Geography data for the sculpted 3D world map.
 *
 * The elevation, country-index and colour rasters are prepared offline by
 * `scripts/build-map-data.mjs` (see docs/map-data.md for sources and licences).
 * This module only loads them and converts between geography and scene space.
 *
 * Projection: equirectangular (plate carrée) cropped to 84°N–58°S. Longitude
 * and latitude use the same scale except for a small vertical stretch, chosen
 * so the flat map composition reads like the product's reference artwork.
 * Distortion is therefore mild but real: high latitudes are stretched
 * vertically, and nothing beyond 84°N / 58°S is drawn.
 */

import * as THREE from "three";

export const MAP_LAYOUT = {
  lonMin: -180,
  lonMax: 180,
  latTop: 84,
  latBottom: -58,
  /** Scene units from the western to the eastern edge. */
  worldWidth: 100,
  /** Vertical stretch relative to a 1:1 plate carrée. */
  verticalStretch: 1.15,
} as const;

export const LAT_SPAN = MAP_LAYOUT.latTop - MAP_LAYOUT.latBottom;
export const WORLD_DEPTH =
  MAP_LAYOUT.worldWidth * (LAT_SPAN / 360) * MAP_LAYOUT.verticalStretch;

/** Relief is stored in metres; the pipeline clamps ocean to 0. */
export const MAX_ELEVATION = 9000;
/** Tallest point in scene units at 9,000 m before the relief curve. */
export const MAX_RELIEF = 9;

/** Height of the terrain surface in scene units for a 0..1 elevation sample. */
export function reliefFor(sample: number): number {
  const h = Math.max(0, Math.min(1, sample));
  return MAX_RELIEF * Math.pow(h, 1.35);
}

export type Lens = { lon: number; lat: number };

export type CountryRecord = {
  id: number;
  name: string;
  iso2: string;
  iso3: string;
  continent: string;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
};

export type StateRecord = {
  name: string;
  code: string;
  lat: number;
  lon: number;
  bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number };
  rings: [number, number][][];
};

export type HeightField = {
  data: Float32Array;
  width: number;
  height: number;
};

export type MapData = {
  height: HeightField;
  colours: { data: Uint8Array; width: number; height: number };
  ids: { data: Uint8Array; width: number; height: number };
  countries: CountryRecord[];
  byId: Map<number, CountryRecord>;
};

export type RegionData = {
  height: HeightField;
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number };
  label: string;
};

export type MapSelection = {
  kind: "country" | "state";
  /** ISO3 for countries, state code for Nigerian states. */
  id: string;
  name: string;
  country: string;
  lon: number;
  lat: number;
  bbox?: [number, number, number, number];
  continent?: string;
};

/* ------------------------------------------------------------- projection */

export function lonLatToWorld(lon: number, lat: number): { x: number; z: number } {
  return {
    x: ((lon - MAP_LAYOUT.lonMin) / 360) * MAP_LAYOUT.worldWidth - MAP_LAYOUT.worldWidth / 2,
    z: ((MAP_LAYOUT.latTop - lat) / LAT_SPAN) * WORLD_DEPTH - WORLD_DEPTH / 2,
  };
}

export function worldToLonLat(x: number, z: number): { lon: number; lat: number } {
  return {
    lon: MAP_LAYOUT.lonMin + ((x + MAP_LAYOUT.worldWidth / 2) / MAP_LAYOUT.worldWidth) * 360,
    lat: MAP_LAYOUT.latTop - ((z + WORLD_DEPTH / 2) / WORLD_DEPTH) * LAT_SPAN,
  };
}

/** Texture coordinates with v = 0 at the northern edge. */
export function lonLatToUv(lon: number, lat: number): { u: number; v: number } {
  return {
    u: (lon - MAP_LAYOUT.lonMin) / 360,
    v: (MAP_LAYOUT.latTop - lat) / LAT_SPAN,
  };
}

/** Bilinear elevation sample in metres (0 for ocean). */
export function sampleElevation(field: HeightField, lon: number, lat: number): number {
  const { u, v } = lonLatToUv(lon, lat);
  const x = Math.min(field.width - 1, Math.max(0, u * field.width - 0.5));
  const y = Math.min(field.height - 1, Math.max(0, v * field.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const field0 = field.data;
  const a = field0[y0 * field.width + x0] ?? 0;
  const b = field0[y0 * field.width + x1] ?? 0;
  const c = field0[y1 * field.width + x0] ?? 0;
  const d = field0[y1 * field.width + x1] ?? 0;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function sampleRelief(field: HeightField, lon: number, lat: number): number {
  return reliefFor(sampleElevation(field, lon, lat) / MAX_ELEVATION);
}

export function pointInRings(rings: [number, number][][], lon: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const current = ring[i];
      const previous = ring[j];
      if (!current || !previous) continue;
      const [xi, yi] = current;
      const [xj, yj] = previous;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/* ------------------------------------------------------------------ load */

const asset = (file: string) => `${import.meta.env.BASE_URL}map/${file}`;

const imageCache = new Map<string, Promise<ImageData>>();

async function loadImageData(file: string): Promise<ImageData> {
  const cached = imageCache.get(file);
  if (cached) return cached;

  const promise = (async () => {
    const response = await fetch(asset(file));
    if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
    const blob = await response.blob();

    let source: ImageBitmap | HTMLImageElement;
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(blob);
    } else {
      const url = URL.createObjectURL(blob);
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not decode ${file}`));
        image.src = url;
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    context.drawImage(source, 0, 0);
    return context.getImageData(0, 0, source.width, source.height);
  })();

  imageCache.set(file, promise);
  return promise;
}

async function loadJson<T>(file: string): Promise<T> {
  const response = await fetch(asset(file));
  if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
  return (await response.json()) as T;
}

/** Decode the R+G 16-bit elevation channels into a Float32 field. */
function toHeightField(image: ImageData): HeightField {
  const { width, height, data } = image;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = (((data[p] ?? 0) << 8) | (data[p + 1] ?? 0)) / 65535;
  }
  return { data: out, width, height };
}

function toRgba(image: ImageData): Uint8Array {
  if (image.data.length === image.width * image.height * 4) {
    return new Uint8Array(image.data.buffer.slice(0));
  }
  const out = new Uint8Array(image.width * image.height * 4);
  for (let i = 0, p = 0; p < image.data.length; i += 4, p += 3) {
    out[i] = image.data[p] ?? 0;
    out[i + 1] = image.data[p + 1] ?? 0;
    out[i + 2] = image.data[p + 2] ?? 0;
    out[i + 3] = 255;
  }
  return out;
}

let globalPromise: Promise<MapData> | null = null;

export function loadMapData(): Promise<MapData> {
  if (globalPromise) return globalPromise;

  globalPromise = Promise.all([
    loadImageData("terrain-height.png"),
    loadImageData("terrain-color.png"),
    loadImageData("country-ids.png"),
    loadJson<{ countries: CountryRecord[] }>("countries.json"),
  ])
    .then(([height, colour, ids, countryFile]) => {
      const countries = countryFile.countries;
      const byId = new Map(countries.map((country) => [country.id, country]));
      return {
        height: toHeightField(height),
        colours: { data: new Uint8Array(colour.data.buffer.slice(0)), width: colour.width, height: colour.height },
        ids: { data: toRgba(ids), width: ids.width, height: ids.height },
        countries,
        byId,
      };
    })
    .catch((error) => {
      globalPromise = null;
      throw error;
    });

  return globalPromise;
}

let regionPromise: Promise<RegionData> | null = null;

export function loadRegionData(): Promise<RegionData> {
  if (regionPromise) return regionPromise;

  regionPromise = Promise.all([
    loadImageData("nigeria-height.png"),
    loadJson<{ label: string; bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number } }>(
      "region.json",
    ),
  ])
    .then(([height, meta]) => ({
      height: toHeightField(height),
      bounds: meta.bbox,
      label: meta.label,
    }))
    .catch((error) => {
      regionPromise = null;
      throw error;
    });

  return regionPromise;
}

let statesPromise: Promise<StateRecord[]> | null = null;

export function loadNigeriaStates(): Promise<StateRecord[]> {
  if (statesPromise) return statesPromise;
  statesPromise = loadJson<{ states: StateRecord[] }>("nigeria-states.json")
    .then((file) => file.states)
    .catch((error) => {
      statesPromise = null;
      throw error;
    });
  return statesPromise;
}

/* --------------------------------------------------------- GPU resources */

export function toHeightTexture(field: HeightField): THREE.DataTexture {
  const half = new Uint16Array(field.data.length);
  for (let i = 0; i < field.data.length; i += 1) {
    half[i] = THREE.DataUtils.toHalfFloat(field.data[i] ?? 0);
  }
  const texture = new THREE.DataTexture(half, field.width, field.height, THREE.RedFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function toColourTexture(source: { data: Uint8Array; width: number; height: number }): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    source.data,
    source.width,
    source.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function toIdTexture(source: { data: Uint8Array; width: number; height: number }): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    source.data,
    source.width,
    source.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
