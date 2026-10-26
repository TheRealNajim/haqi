/**
 * Build the HAQI 3D map's offline geography data.
 *
 * Outputs (public/map/):
 *   terrain-height.png  - 2048x1024 equirectangular elevation, 16-bit in R+G
 *   nigeria-height.png  - 1536x1536 regional elevation for Nigeria / West Africa
 *   terrain-color.png   - 1024x512 artistic land base colour + highland warmth in A
 *   country-ids.png     - 2048x1024 country index (R) and continent index (G)
 *   countries.json      - country index metadata (name, ISO, label point, continent)
 *   nigeria-states.json - Natural Earth admin-1 boundaries for Nigeria
 *
 * Inputs:
 *   AWS Open Data terrain tiles (Mapzen "terrarium" encoding, z4), which are
 *   derived from NASA SRTM, USGS GMTED2010, NOAA ETOPO1 and friends.
 *   Natural Earth 1:110m admin-0 countries and 1:10m admin-1 states/provinces
 *   (public domain, naturalearthdata.com).
 *
 * The colour map is ARTISTIC. It is not an air-quality measure and carries no
 * country-level data beyond an index into countries.json.
 *
 * Run with: node scripts/build-map-data.mjs
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodePng, encodePng } from "./lib/png.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache", "map-build");
const OUT = path.join(ROOT, "public", "map");

const WIDTH = 2048;
const HEIGHT = 1024;
const LAT_TOP = 84;
const LAT_BOTTOM = -58;
const TILE_SIZE = 256;
const ZOOM = 4;
const TILE_COUNT = 2 ** ZOOM;
const MAX_ELEVATION = 9000;

const NE_110M =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const NE_10M_STATES =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";

/** Regional detail patch: Nigeria plus enough context to read West Africa. */
const REGION = {
  name: "nigeria",
  zoom: 7,
  width: 1536,
  height: 1536,
  bbox: { minLon: -6, maxLon: 16, minLat: 1, maxLat: 15 },
};

/* ------------------------------------------------------------------ http */

async function download(url, file) {
  if (existsSync(file)) return readFile(file);

  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      // Write through a temp file so an interrupted download is never cached.
      await writeFile(`${file}.tmp`, buffer);
      await rename(`${file}.tmp`, file);
      return buffer;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function pool(items, worker, concurrency = 8) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

/* ------------------------------------------------------- projection maths */

const mercatorY = (lat) => {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return (0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI)) * TILE_COUNT * TILE_SIZE;
};

const worldX = (lon) => ((lon + 180) / 360) * TILE_COUNT * TILE_SIZE;

/* --------------------------------------------------------------- heightmap */

async function buildHeightTileSet({ name, zoom, width, height, bbox }) {
  const scale = 2 ** zoom;
  const worldSize = scale * TILE_SIZE;
  const mercY = (lat) => {
    const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const rad = (clamped * Math.PI) / 180;
    return (0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI)) * worldSize;
  };
  const mercX = (lon) => ((lon + 180) / 360) * worldSize;

  const tx0 = Math.max(0, Math.floor(mercX(bbox.minLon) / TILE_SIZE));
  const tx1 = Math.min(scale - 1, Math.floor(mercX(bbox.maxLon - 1e-9) / TILE_SIZE));
  const ty0 = Math.max(0, Math.floor(mercY(bbox.maxLat) / TILE_SIZE));
  const ty1 = Math.min(scale - 1, Math.floor(mercY(bbox.minLat + 1e-9) / TILE_SIZE));

  const tiles = [];
  for (let y = ty0; y <= ty1; y += 1) {
    for (let x = tx0; x <= tx1; x += 1) tiles.push({ x, y });
  }

  console.log(`${name}: ${tiles.length} terrarium tiles at z${zoom}…`);
  const decoded = await pool(
    tiles,
    async ({ x, y }, index) => {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
      const file = path.join(CACHE, "terrarium", `${zoom}-${x}-${y}.png`);
      const buffer = await download(url, file);
      if (index % 32 === 0) console.log(`  ${index}/${tiles.length}`);
      return decodePng(buffer);
    },
    4,
  );

  const mosaicW = (tx1 - tx0 + 1) * TILE_SIZE;
  const mosaicH = (ty1 - ty0 + 1) * TILE_SIZE;
  const mosaic = new Float32Array(mosaicW * mosaicH).fill(Number.NaN);
  const originX = tx0 * TILE_SIZE;
  const originY = ty0 * TILE_SIZE;

  for (let i = 0; i < tiles.length; i += 1) {
    const { x, y } = tiles[i];
    const { data } = decoded[i];
    const baseX = (x - tx0) * TILE_SIZE;
    const baseY = (y - ty0) * TILE_SIZE;
    for (let py = 0; py < TILE_SIZE; py += 1) {
      for (let px = 0; px < TILE_SIZE; px += 1) {
        const o = (py * TILE_SIZE + px) * 3;
        // Mapzen terrarium: metres = (R * 256 + G + B / 256) - 32768
        const metres = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
        mosaic[(baseY + py) * mosaicW + baseX + px] = metres;
      }
    }
  }

  const pixels = Buffer.alloc(width * height * 4);
  let min = Infinity;
  let max = -Infinity;
  let land = 0;

  for (let py = 0; py < height; py += 1) {
    const lat = bbox.maxLat - ((py + 0.5) / height) * (bbox.maxLat - bbox.minLat);
    const sy = mercY(lat) - originY - 0.5;
    const y0 = Math.max(0, Math.min(mosaicH - 2, Math.floor(sy)));
    const fy = Math.min(1, Math.max(0, sy - y0));

    for (let px = 0; px < width; px += 1) {
      const lon = bbox.minLon + ((px + 0.5) / width) * (bbox.maxLon - bbox.minLon);
      const sx = mercX(lon) - originX - 0.5;
      const x0 = Math.max(0, Math.min(mosaicW - 2, Math.floor(sx)));
      const fx = Math.min(1, Math.max(0, sx - x0));
      const x1 = x0 + 1;
      const y1 = y0 + 1;

      const a = mosaic[y0 * mosaicW + x0];
      const b = mosaic[y0 * mosaicW + x1];
      const c = mosaic[y1 * mosaicW + x0];
      const d = mosaic[y1 * mosaicW + x1];
      const elevation = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;

      if (elevation < min) min = elevation;
      if (elevation > max) max = elevation;

      const landElevation = Math.max(0, elevation);
      if (landElevation > 1) land += 1;

      const value = Math.min(65535, Math.round((landElevation / MAX_ELEVATION) * 65535));
      const o = (py * width + px) * 4;
      pixels[o] = value >> 8;
      pixels[o + 1] = value & 0xff;
      pixels[o + 2] = 0;
      pixels[o + 3] = 255;
    }
  }

  console.log(
    `${name}: min ${min.toFixed(0)} m, max ${max.toFixed(0)} m, land ${((land / (width * height)) * 100).toFixed(1)}%`,
  );
  await writeFile(path.join(OUT, `${name}-height.png`), encodePng(width, height, pixels));
}

async function buildHeights() {
  await buildHeightTileSet({
    name: "terrain",
    zoom: ZOOM,
    width: WIDTH,
    height: HEIGHT,
    bbox: { minLon: -180, maxLon: 180, minLat: LAT_BOTTOM, maxLat: LAT_TOP },
  });
  await buildHeightTileSet({
    name: REGION.name,
    zoom: REGION.zoom,
    width: REGION.width,
    height: REGION.height,
    bbox: REGION.bbox,
  });
}

/* --------------------------------------------------------------- geometry */

function ringsOf(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function boundsOf(rings) {
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

/**
 * Scanline fill of one feature's rings (even-odd), calling `paint(x, y)` for
 * every covered pixel centre. Works in equirectangular output space.
 */
function rasterizeFeature(bounds, rings, width, height, paint) {
  const yFromLat = (lat) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * height;
  const xFromLon = (lon) => ((lon + 180) / 360) * width;

  const xMin = Math.max(0, Math.floor(xFromLon(bounds.minLon)));
  const xMax = Math.min(width - 1, Math.ceil(xFromLon(bounds.maxLon)));
  const yMin = Math.max(0, Math.floor(yFromLat(bounds.maxLat)));
  const yMax = Math.min(height - 1, Math.ceil(yFromLat(bounds.minLat)));
  if (xMax < xMin || yMax < yMin) return;

  const segments = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [lonA, latA] = ring[i];
      const [lonB, latB] = ring[i + 1];
      const yA = yFromLat(latA);
      const yB = yFromLat(latB);
      segments.push({ xA: xFromLon(lonA), yA, xB: xFromLon(lonB), yB });
    }
  }

  const crossings = [];
  for (let y = yMin; y <= yMax; y += 1) {
    const sampleY = y + 0.5;
    crossings.length = 0;
    for (const seg of segments) {
      const { xA, yA, xB, yB } = seg;
      if (yA === yB) continue;
      if ((sampleY >= yA && sampleY < yB) || (sampleY >= yB && sampleY < yA)) {
        crossings.push(xA + ((sampleY - yA) / (yB - yA)) * (xB - xA));
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(xMin, Math.round(crossings[i] - 0.5));
      const to = Math.min(xMax, Math.round(crossings[i + 1] - 0.5));
      for (let x = from; x <= to; x += 1) paint(x, y);
    }
  }
}

/* -------------------------------------------------- countries + colour map */

const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
  "Antarctica",
];

/** Artistic lowland colour by continent (sRGB, 0-255). */
const PALETTE = {
  Africa: [47, 160, 152],
  Asia: [112, 151, 79],
  Europe: [178, 169, 97],
  "North America": [223, 229, 219],
  "South America": [219, 229, 211],
  Oceania: [143, 158, 88],
  Antarctica: [238, 240, 238],
};

/** How strongly high ground warms toward terracotta. */
const WARMTH = {
  Africa: 0.08,
  Asia: 0.95,
  Europe: 0.5,
  "North America": 0.18,
  "South America": 0.12,
  Oceania: 0.4,
  Antarctica: 0,
};

const COUNTRY_TWEAKS = {
  GRL: { color: [233, 237, 235], warmth: 0 },
  DZA: { color: [83, 178, 166] },
  LBY: { color: [91, 181, 169] },
  EGY: { color: [87, 178, 166] },
  TCD: { color: [74, 173, 161] },
  NER: { color: [83, 178, 166] },
  MLI: { color: [80, 174, 162] },
  MRT: { color: [86, 178, 165] },
  SDN: { color: [75, 170, 158] },
  SAU: { color: [150, 158, 82], warmth: 0.6 },
  IRN: { color: [130, 150, 79], warmth: 0.7 },
  IND: { color: [120, 156, 75], warmth: 0.55 },
  IDN: { color: [104, 155, 74] },
  JPN: { color: [116, 158, 82] },
  AUS: { color: [159, 166, 92] },
  NZL: { color: [128, 154, 84] },
  ANT: { color: [238, 240, 238], warmth: 0 },
};

/** Deterministic ±4% tint so neighbouring countries are not one flat block. */
function jitter(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return 0.96 + ((hash % 1000) / 1000) * 0.08;
}

function colourFor(feature) {
  const props = feature.properties;
  const tweak = COUNTRY_TWEAKS[props.ISO_A3] ?? {};
  const base = tweak.color ?? PALETTE[props.CONTINENT] ?? PALETTE.Asia;
  const factor = jitter(props.ISO_A3 || props.NAME);
  return {
    color: base.map((value) => Math.max(0, Math.min(255, Math.round(value * factor)))),
    warmth: Math.round(((tweak.warmth ?? WARMTH[props.CONTINENT] ?? 0.3) * 255) | 0),
  };
}

async function buildCountries() {
  const file = path.join(CACHE, "ne_110m_admin_0_countries.geojson");
  const raw = JSON.parse((await download(NE_110M, file)).toString("utf8"));

  const features = raw.features
    .map((feature) => {
      const rings = ringsOf(feature.geometry);
      return { feature, rings, bounds: boundsOf(rings), area: 0 };
    })
    .filter(
      (item) =>
        item.rings.length > 0 &&
        item.bounds.maxLat > LAT_BOTTOM &&
        item.bounds.minLat < LAT_TOP &&
        (item.feature.properties.CONTINENT ?? "") !== "Antarctica",
    )
    .map((item) => ({
      ...item,
      area: (item.bounds.maxLon - item.bounds.minLon) * (item.bounds.maxLat - item.bounds.minLat),
    }))
    // Large shapes first, so small countries and enclaves paint on top.
    .sort((a, b) => b.area - a.area);

  const ids = Buffer.alloc(WIDTH * HEIGHT * 3);
  const colours = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2) * 4);
  const countries = [];

  features.forEach((item, index) => {
    const id = index + 1;
    if (id > 255) throw new Error("More countries than the 8-bit id texture can hold");
    const props = item.feature.properties;
    const continent = CONTINENTS.indexOf(props.CONTINENT ?? "Asia");
    const { color, warmth } = colourFor(item.feature);

    rasterizeFeature(item.bounds, item.rings, WIDTH, HEIGHT, (x, y) => {
      const o = (y * WIDTH + x) * 3;
      ids[o] = id;
      ids[o + 1] = Math.max(0, continent);
      // Blue carries the highland warmth mask: alpha cannot survive the
      // browser's premultiplied canvas round-trip when it reaches zero.
      ids[o + 2] = warmth;
    });

    rasterizeFeature(item.bounds, item.rings, WIDTH / 2, HEIGHT / 2, (x, y) => {
      const o = (y * (WIDTH / 2) + x) * 4;
      colours[o] = color[0];
      colours[o + 1] = color[1];
      colours[o + 2] = color[2];
      colours[o + 3] = 255;
    });

    countries.push({
      id,
      name: props.NAME_EN || props.NAME,
      iso2: props.ISO_A2 || "",
      iso3: props.ISO_A3 || "",
      continent: props.CONTINENT ?? "",
      lat: Number(props.LABEL_Y ?? props.LATITUDE ?? 0),
      lon: Number(props.LABEL_X ?? props.LONGITUDE ?? 0),
      bbox: [
        item.bounds.minLon,
        item.bounds.minLat,
        item.bounds.maxLon,
        item.bounds.maxLat,
      ],
    });
  });

  await writeFile(path.join(OUT, "country-ids.png"), encodePng(WIDTH, HEIGHT, idsToRgba(ids)));
  await writeFile(
    path.join(OUT, "terrain-color.png"),
    encodePng(WIDTH / 2, HEIGHT / 2, colours),
  );
  await writeFile(path.join(OUT, "countries.json"), JSON.stringify({ countries }));
  console.log(`countries: ${countries.length} rasterised`);
}

function idsToRgba(ids) {
  const rgba = Buffer.alloc((ids.length / 3) * 4);
  for (let i = 0, o = 0; i < ids.length; i += 3, o += 4) {
    rgba[o] = ids[i];
    rgba[o + 1] = ids[i + 1];
    rgba[o + 2] = ids[i + 2];
    rgba[o + 3] = 255;
  }
  return rgba;
}

/* ------------------------------------------------------------ nigeria */

function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    const [x1, y1] = points[first];
    const [x2, y2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1e-9;
    let best = -1;
    let bestDistance = 0;

    for (let i = first + 1; i < last; i += 1) {
      const [x, y] = points[i];
      const distance = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / length;
      if (distance > bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }

    if (bestDistance > tolerance && best > -1) {
      keep[best] = 1;
      stack.push([first, best], [best, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

async function buildNigeriaStates() {
  console.log("nigeria: downloading 1:10m admin-1 boundaries…");
  const file = path.join(CACHE, "ne_10m_admin_1_states_provinces.geojson");
  const raw = JSON.parse((await download(NE_10M_STATES, file)).toString("utf8"));

  const states = raw.features
    .filter((feature) => feature.properties.adm0_a3 === "NGA")
    .map((feature) => {
      const rings = ringsOf(feature.geometry)
        .map((ring) => simplify(ring, 0.004))
        .filter((ring) => ring.length >= 4);
      const largest = rings.reduce(
        (best, ring) => (ring.length > (best?.length ?? 0) ? ring : best),
        null,
      );
      const center = largest
        ? largest.reduce(
            (acc, [lon, lat], _index, list) => [acc[0] + lon / list.length, acc[1] + lat / list.length],
            [0, 0],
          )
        : [0, 0];
      return {
        name: feature.properties.name,
        code: feature.properties.iso_3166_2 ?? feature.properties.adm1_code,
        rings,
        lat: Number(feature.properties.latitude ?? center[1]),
        lon: Number(feature.properties.longitude ?? center[0]),
        bbox: boundsOf(rings),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  await writeFile(
    path.join(OUT, "nigeria-states.json"),
    JSON.stringify({ country: "Nigeria", states }),
  );
  console.log(`nigeria: ${states.length} states → ${states.map((s) => s.name).join(", ")}`);
}

/* ----------------------------------------------------------------- run */

await mkdir(OUT, { recursive: true });
await writeFile(
  path.join(OUT, "region.json"),
  JSON.stringify({
    name: REGION.name,
    label: "Nigeria and West Africa",
    bbox: REGION.bbox,
    width: REGION.width,
    height: REGION.height,
    zoom: REGION.zoom,
  }),
);
await mkdir(path.join(CACHE, "terrarium"), { recursive: true });

await buildHeights();
await buildCountries();
await buildNigeriaStates();

console.log("done");
