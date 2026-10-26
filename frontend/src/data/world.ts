/**
 * Name bridges between the map's Natural Earth data and the curated filter
 * lists in `data/geo.ts`. The map covers every country; the filters only offer
 * a working subset, so a selection may legitimately have no filter entry.
 */

import { COUNTRIES_BY_REGION } from "@/data/geo";

const COUNTRY_ALIASES: Record<string, string> = {
  "United States of America": "United States",
  "People's Republic of China": "China",
  "Ivory Coast": "Côte d'Ivoire",
  "Republic of the Congo": "Congo",
  "Democratic Republic of the Congo": "Democratic Republic of the Congo",
  "The Gambia": "Gambia",
  "The Bahamas": "Bahamas",
  "East Timor": "Timor-Leste",
};

/** Natural Earth spells a few Nigerian states differently from the filters. */
const AREA_ALIASES: Record<string, string> = {
  Nassawara: "Nasarawa",
  "Federal Capital Territory": "Federal Capital Territory",
};

export function appCountryFor(mapName: string): { country: string; region: string } | null {
  const name = COUNTRY_ALIASES[mapName] ?? mapName;
  for (const [region, countries] of Object.entries(COUNTRIES_BY_REGION)) {
    if (countries?.includes(name)) return { country: name, region };
  }
  return null;
}

export function appAreaFor(mapName: string): string {
  return AREA_ALIASES[mapName] ?? mapName;
}
