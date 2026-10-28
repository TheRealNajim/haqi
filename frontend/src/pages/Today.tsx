import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Share2, Eye, ArrowUpRight, Flame, Wind, Radio, MapPin, RefreshCw, X } from "lucide-react";

import { COUNTRIES_BY_REGION } from "@/data/geo";
import { appCountryFor } from "@/data/world";
import { WorldMap } from "@/components/map/WorldMap";
import { countrySelection } from "@/components/map/MapInteraction";
import { loadMapData, type MapSelection } from "@/components/map/mapData";
import { countryCenter, type Place } from "@/data/places";
import { loadToday, type TodayReading } from "@/data/today";
import type { PlaceStatus } from "@/hooks/usePlace";
import { useTodayReading } from "@/hooks/useTodayReading";
import type { Evidence } from "@/lib/api";
import { K, canvasPosition } from "@/lib/canvas";

/* ---------- small building blocks ---------- */

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[18px] bg-surface ${className}`}>{children}</div>;
}

/* ---------- reading helpers ---------- */

const LEVEL_CHIP: Record<string, string> = {
  "good to go": "bg-risk-green/15 text-risk-green",
  "be careful": "bg-risk-orange-soft text-risk-orange",
  "stay in": "bg-risk-red-soft text-risk-red",
};

const LEVEL_DOT: Record<string, string> = {
  "good to go": "bg-risk-green ring-risk-green/20",
  "be careful": "bg-risk-orange ring-risk-orange/20",
  "stay in": "bg-risk-red ring-risk-red/20",
};

const SOURCE_NAMES: Record<string, string> = {
  openaq: "OpenAQ ground stations",
  waqi: "WAQI city index",
  openweather: "OpenWeather wind forecast",
  firms: "NASA FIRMS fire hotspots",
  brightdata: "Bright Data advisories",
  cams: "CAMS pollen forecast",
  zetaris: "Zetaris SQL layer",
};

function sourceName(sourceId: string) {
  const prefix = sourceId.split(":")[0] ?? sourceId;
  return SOURCE_NAMES[prefix] ?? prefix;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "at an unknown time";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "at an unknown time";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return `${Math.round(days / 30)} mo ago`;
}

function clockTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function short(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return String(Number(value.toFixed(digits)));
}

/** Strongest reading carrying a PM2.5-equivalent unit. */
function pm25Reading(evidence: Evidence[]): Evidence | null {
  return (
    evidence
      .filter((item) => item.raw_value !== null && (item.unit ?? "").includes("µg/m³"))
      .sort((a, b) => b.weight - a.weight)[0] ?? null
  );
}

const AQI_BANDS = [
  { share: 50, className: "bg-risk-green" },
  { share: 50, className: "bg-risk-yellow" },
  { share: 50, className: "bg-risk-orange" },
  { share: 150, className: "bg-risk-red" },
];

function AqiScale({ aqi, desktop }: { aqi: number; desktop: boolean }) {
  const marker = Math.min(100, Math.max(0, (aqi / 300) * 100));
  return (
    <div>
      <div className="relative">
        <div className={`flex overflow-hidden rounded-full ${desktop ? "h-3" : "h-2"}`}>
          {AQI_BANDS.map((band, index) => (
            <span
              key={index}
              className={band.className}
              style={{ width: `${(band.share / 300) * 100}%` }}
            />
          ))}
        </div>
        <span
          aria-hidden="true"
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[var(--shadow-soft)] ${
            desktop ? "size-5 border-[3px]" : "size-3.5 border-2"
          } border-surface`}
          style={{ left: `${marker}%` }}
        />
      </div>
      <div
        className={`mt-2 flex justify-between text-ink-faint ${
          desktop ? "text-[12px]" : "text-[9px]"
        }`}
      >
        <span>0</span>
        <span>US AQI scale · live</span>
        <span>300+</span>
      </div>
    </div>
  );
}

function StatTile({
  desktop,
  icon,
  value,
  label,
}: {
  desktop: boolean;
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div>
      <div
        className={`flex items-center gap-1.5 text-ink ${desktop ? "text-[19px]" : "text-[15px]"}`}
      >
        {icon} {value}
      </div>
      <div className={`text-ink-faint ${desktop ? "text-[12px]" : "text-[9px]"}`}>{label}</div>
    </div>
  );
}

type TopRow = { name: string; aqi: number | null; level: string };

/** Countries to rank for the region, with the selected country first. */
function countriesToRank(region: string, selected: string, limit: number): string[] {
  const list = COUNTRIES_BY_REGION[region] ?? [];
  if (!list.length) return [];
  const ordered =
    selected && list.includes(selected) ? [selected, ...list.filter((c) => c !== selected)] : list;
  return ordered.slice(0, limit);
}

/* ---------- page ---------- */

export type TodayPageProps = {
  desktop: boolean;
  place: Place | null;
  placeStatus: PlaceStatus;
  placeNote: string | null;
  region: string;
  country: string;
  area: string;
  active: boolean;
  /** Design-space upward offset so the cards clear the fold without scrolling. */
  lift?: number;
  onUseMyLocation: () => void;
  onViewFullMap: () => void;
};

export function TodayPage({
  desktop,
  place,
  placeStatus,
  placeNote,
  region,
  country,
  area,
  active,
  lift = 0,
  onUseMyLocation,
  onViewFullMap,
}: TodayPageProps) {
  const pos = (l: number, t: number, w: number, h: number) => canvasPosition(desktop, l, t, w, h);
  const lifted = (base: number, limit = Infinity) => base - Math.min(lift, limit);
  /** Mobile cards are drawn at 85% of the desktop type/padding scale. */
  const s = (desktopClass: string, mobileClass: string) => (desktop ? desktopClass : mobileClass);

  const [panelOpen, setPanelOpen] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);
  const [topRows, setTopRows] = useState<TopRow[] | null>(null);
  const [miniMapSelection, setMiniMapSelection] = useState<MapSelection | null>(null);

  const { reading, status, error, retry } = useTodayReading(place, active);
  const verdict = reading?.verdict ?? null;
  const evidence = useMemo(() => verdict?.evidence ?? [], [verdict]);

  const pm25 = pm25Reading(evidence);
  const wind = evidence.find((item) => item.source_type === "forecast") ?? null;
  const fire = evidence.find((item) => item.source_type === "satellite") ?? null;
  const fresh = evidence.filter((item) => !item.staleness_flag).length;
  const strongest = useMemo(
    () => [...evidence].sort((a, b) => b.weight - a.weight)[0] ?? null,
    [evidence],
  );

  const sources = useMemo(() => {
    const map = new Map<string, { name: string; count: number; stale: number }>();
    for (const item of evidence) {
      const name = sourceName(item.source_id);
      const found = map.get(name) ?? { name, count: 0, stale: 0 };
      found.count += 1;
      if (item.staleness_flag) found.stale += 1;
      map.set(name, found);
    }
    return [...map.values()];
  }, [evidence]);

  const latestObservation = evidence
    .map((item) => item.observed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  useEffect(() => {
    let alive = true;
    if (!active || !country) {
      setMiniMapSelection(null);
      return;
    }

    loadMapData()
      .then((data) => {
        if (!alive) return;
        const mapCountry = data.countries.find(
          (candidate) => appCountryFor(candidate.name)?.country === country,
        );
        setMiniMapSelection(mapCountry ? countrySelection(mapCountry) : null);
      })
      .catch(() => {
        if (alive) setMiniMapSelection(null);
      });

    return () => {
      alive = false;
    };
  }, [active, country]);

  useEffect(() => {
    setPanelOpen(true);
  }, [active, region, country, area]);

  const activeRegion = region || place?.region || "";

  // Rank the region's countries once per region. The selected country is first.
  useEffect(() => {
    if (!active || !activeRegion) {
      setTopRows(null);
      return;
    }
    let alive = true;
    setTopRows(null);
    const names = countriesToRank(activeRegion, place?.country ?? "", 4);

    Promise.allSettled(
      names.map(async (name) => {
        const center = await countryCenter(name);
        if (!center) return null;
        const result: TodayReading = await loadToday(center.lat, center.lon);
        return { name, aqi: result.verdict.aqi, level: result.verdict.level };
      }),
    ).then((results) => {
      if (!alive) return;
      const rows = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => (result as PromiseFulfilledResult<TopRow | null>).value)
        .filter((row): row is TopRow => row !== null);
      setTopRows(rows);
    });

    return () => {
      alive = false;
    };
  }, [active, activeRegion, place?.country]);

  const sortedRows = useMemo(() => {
    if (!topRows) return null;
    return [...topRows].sort((a, b) => {
      const left = a.aqi ?? -1;
      const right = b.aqi ?? -1;
      return sortDesc ? right - left : left - right;
    });
  }, [topRows, sortDesc]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied to clipboard");
    } catch {
      toast("Couldn't copy the link");
    }
  };

  const aqi = verdict?.aqi ?? null;
  const level = verdict?.level ?? "";
  const areaLabel =
    area && country ? `${area}, ${country}` : country || region || place?.label || "Your area";
  const areaNote =
    placeNote ??
    (place?.source === "ip"
      ? "Approximate location from your network"
      : area && country
        ? "Selected area"
        : country
          ? "Country-wide view"
          : region
            ? "Choose a country to see local air quality"
            : "Choose a location in the filters above");

  return (
    <>
      {/* Title */}
      <div style={pos(119, 120, 700, 90)} className={desktop ? "" : "mt-6"}>
        <h1
          className={`font-display leading-[1.25] tracking-[-0.01em] text-black ${
            desktop ? "text-[42px]" : "text-[30px]"
          }`}
        >
          World Risk Map
        </h1>
        <p className={`mt-1 text-black ${desktop ? "text-[18px]" : "text-[15px]"}`}>
          Live air quality for the place you are looking at.
        </p>
      </div>
      <div className={desktop ? "contents" : "mt-4 flex items-center gap-2"}>
        <button
          onClick={share}
          style={pos(1592, 129, 116, 48)}
          className={`flex items-center justify-center gap-2 rounded-[10px] bg-surface text-ink ${
            desktop ? "text-[18px]" : "h-9 whitespace-nowrap px-4 text-[14px]"
          }`}
        >
          Share <Share2 className="size-4" strokeWidth={1.6} />
        </button>
        <button
          onClick={onViewFullMap}
          style={pos(1729, 129, 160, 48)}
          className={`flex items-center justify-center gap-2 rounded-[10px] bg-ink text-surface ${
            desktop ? "text-[18px]" : "h-9 whitespace-nowrap px-4 text-[14px]"
          }`}
        >
          View Full Map
          <Eye className={desktop ? "size-5" : "size-4"} strokeWidth={1.6} />
        </button>
      </div>

      {/* Cards sit a touch further from the screen edges on mobile. */}
      <div className={desktop ? "contents" : "px-2"}>
        {/* Area panel */}
        {panelOpen && (
          <div
            style={pos(1365, lifted(365, 165), 445, 443)}
            className={desktop ? "" : "relative mt-6 h-[440px]"}
          >
            <button
              onClick={() => setPanelOpen(false)}
              aria-label="Close"
              className={`absolute left-1/2 top-0 z-10 flex -translate-x-[15%] items-center justify-center rounded-full bg-surface text-ink shadow-[var(--shadow-soft)] ring-canvas/70 ${s(
                "size-[72px] ring-8",
                "size-[54px] ring-[5px]",
              )}`}
            >
              <X className={s("size-7", "size-5")} strokeWidth={1.8} />
            </button>
            <Card
              className={`absolute inset-x-0 bottom-0 overflow-hidden bg-surface/90 backdrop-blur ${s(
                "top-[40px]",
                "top-[30px]",
              )}`}
            >
              <div className={s("px-[21px] pt-[52px]", "px-4 pt-[38px]")}>
                <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                  <div className="min-w-0">
                    <h3
                      className={`truncate tracking-[-0.01em] text-ink ${s(
                        "text-[26px]",
                        "text-[20px]",
                      )}`}
                    >
                      {areaLabel}
                    </h3>
                    <p className={`mt-0.5 text-ink-faint ${s("text-[12px]", "text-[9px]")}`}>
                      {areaNote}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-ink-faint ${s("text-[15px]", "text-[12px]")}`}>
                      Current AQI
                    </div>
                    <div
                      className={`${s("text-[26px]", "text-[20px]")} ${
                        aqi === null ? "text-ink-faint" : "text-risk-red"
                      }`}
                    >
                      {aqi === null ? "—" : Math.round(aqi)}
                      <span className={`text-ink-faint ${s("text-[19px]", "text-[14px]")}`}>
                        /300
                      </span>
                    </div>
                  </div>
                </div>
                <div className={`grid grid-cols-3 ${s("mt-5 text-[15px]", "mt-3.5 text-[12px]")}`}>
                  <div>
                    <div className="flex items-center gap-2 text-ink">
                      <span
                        className={`${s(
                          "size-2 ring-4",
                          "size-1.5 ring-[3px]",
                        )} rounded-full ${LEVEL_DOT[level] ?? "bg-ink-faint ring-canvas"}`}
                      />{" "}
                      {level || "No reading"}
                    </div>
                    <div className="mt-1.5 text-ink-faint">Right now</div>
                  </div>
                  <div className={`border-l border-border ${s("pl-5", "pl-3.5")}`}>
                    <div className="flex items-center gap-2 text-ink">
                      <span
                        className={`${s(
                          "size-2 ring-4",
                          "size-1.5 ring-[3px]",
                        )} rounded-full bg-risk-teal ring-canvas`}
                      />{" "}
                      Primary signal
                    </div>
                    <div className="mt-1.5 text-ink-faint">
                      {strongest ? sourceName(strongest.source_id) : "No source"}
                    </div>
                  </div>
                  <div className={`border-l border-border ${s("pl-5", "pl-3.5")}`}>
                    <div className="flex items-center gap-2 text-ink">
                      <RefreshCw className="size-4 text-risk-green" /> {fresh} of {evidence.length}{" "}
                      fresh
                    </div>
                    <div className="mt-1.5 text-ink-faint">
                      Checked {reading ? clockTime(reading.fetchedAt) : "—"}
                    </div>
                  </div>
                </div>
              </div>
              <div
                className={`absolute bottom-0 left-0 w-full overflow-hidden ${s(
                  "h-[230px]",
                  "h-[184px]",
                )}`}
              >
                <WorldMap
                  selected={miniMapSelection}
                  onSelect={() => undefined}
                  overlay={false}
                  focusZoom={1.6}
                  className="pointer-events-none scale-[1.2]"
                />
              </div>
            </Card>
          </div>
        )}

        {/* Air Quality in Your Area */}
        <div
          style={pos(120, lifted(795), 758, 495)}
          className={`rounded-[18px] bg-surface ${desktop ? "" : "mt-6 overflow-x-auto"}`}
        >
          <div className={`flex items-start justify-between gap-3 ${s("px-5 pt-5", "px-4 pt-4")}`}>
            <h3 className={`tracking-[-0.01em] text-ink ${s("text-[21px]", "text-[17px]")}`}>
              Air Quality in Your Area
            </h3>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onUseMyLocation}
                className={`flex items-center gap-1.5 rounded-full border border-border text-ink transition-colors hover:border-ink/25 hover:bg-canvas ${s(
                  "px-2.5 py-1 text-[11px]",
                  "px-2 py-0.5 text-[10px]",
                )}`}
              >
                <MapPin className={s("size-3", "size-2.5")} strokeWidth={1.9} />
                Use my location
              </button>
              <button
                onClick={() => setPanelOpen(true)}
                aria-label="Open air quality detail"
                className={`flex items-center justify-center rounded-full border border-border text-ink ${s(
                  "size-[50px]",
                  "size-[40px]",
                )}`}
              >
                <ArrowUpRight className={s("size-5", "size-4")} strokeWidth={1.6} />
              </button>
            </div>
          </div>

          {placeStatus === "empty" ? (
            <div className={s("mt-8 px-5", "mt-6 px-4")}>
              <p
                className={`max-w-[520px] leading-[1.55] text-ink-soft ${s(
                  "text-[16px]",
                  "text-[13px]",
                )}`}
              >
                A whole region has no single air reading. Pick a country above and HAQI will load
                live numbers for it.
              </p>
            </div>
          ) : status === "loading" || status === "idle" ? (
            <div aria-busy="true" className={s("mt-6 px-5", "mt-5 px-4")}>
              <span className="sr-only">Loading the air-quality reading</span>
              <div className={`animate-pulse rounded bg-canvas ${s("h-5 w-40", "h-4 w-32")}`} />
              <div
                className={`mt-3 animate-pulse rounded bg-canvas ${s("h-12 w-32", "h-10 w-28")}`}
              />
              <div className={`mt-6 h-3 w-full animate-pulse rounded bg-canvas`} />
            </div>
          ) : status === "error" || !verdict ? (
            <div className={s("mt-8 px-5", "mt-6 px-4")}>
              <p
                className={`max-w-[520px] leading-[1.55] text-ink-soft ${s(
                  "text-[16px]",
                  "text-[13px]",
                )}`}
              >
                {error ?? "HAQI could not load this reading."}
              </p>
              <button
                onClick={retry}
                className={`mt-4 inline-flex items-center gap-2 rounded-[10px] border border-border text-ink hover:bg-canvas ${s(
                  "px-3 py-2 text-[13px]",
                  "px-2.5 py-1.5 text-[11px]",
                )}`}
              >
                <RefreshCw className={s("size-3.5", "size-3")} strokeWidth={1.8} /> Try again
              </button>
            </div>
          ) : (
            <>
              <div
                className={`flex justify-between ${s("mt-[18px] gap-6 px-5", "mt-3 gap-3.5 px-4")}`}
              >
                <div>
                  <div className={`text-ink-faint ${s("text-[21px]", "text-[16px]")}`}>
                    Current AQI
                  </div>
                  <div
                    className={`mt-1 tracking-[-0.02em] text-ink ${s("text-[44px]", "text-[32px]")}`}
                  >
                    {aqi === null ? "—" : Math.round(aqi)}
                    <span className={`text-ink-faint ${s("text-[19px]", "text-[14px]")}`}>
                      /300
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full ${s(
                        "px-2.5 py-1 text-[12px]",
                        "px-2 py-0.5 text-[10px]",
                      )} ${LEVEL_CHIP[level] ?? "bg-canvas text-ink-soft"}`}
                    >
                      {level || "No reading"}
                    </span>
                    <span className={`text-ink-faint ${s("text-[12px]", "text-[10px]")}`}>
                      {place?.label}
                    </span>
                  </div>
                </div>
                <div
                  className={`grid grid-cols-2 pt-0 ${s(
                    "mr-[-18px] gap-x-[38px] gap-y-[34px]",
                    "mr-[-13px] gap-x-[26px] gap-y-[22px]",
                  )}`}
                >
                  <StatTile
                    desktop={desktop}
                    icon={
                      <Radio
                        className={`${s("size-4", "size-3")} text-risk-teal`}
                        strokeWidth={1.8}
                      />
                    }
                    value={
                      pm25
                        ? `${short(pm25.raw_value)} ${pm25.unit}`
                        : verdict.aqi !== null
                          ? `AQI ${Math.round(verdict.aqi)}`
                          : "—"
                    }
                    label={pm25 ? "PM2.5" : "AQI"}
                  />
                  <StatTile
                    desktop={desktop}
                    icon={
                      <Wind
                        className={`${s("size-4", "size-3")} text-risk-green`}
                        strokeWidth={1.8}
                      />
                    }
                    value={wind ? `${short(wind.raw_value)} ${wind.unit}` : "—"}
                    label="Wind next 3h"
                  />
                  <StatTile
                    desktop={desktop}
                    icon={
                      <Flame
                        className={`${s("size-4", "size-3")} fill-risk-orange text-risk-orange`}
                      />
                    }
                    value={fire ? short(fire.raw_value, 0) : "—"}
                    label="Fire hotspots, 50 km"
                  />
                  <StatTile
                    desktop={desktop}
                    icon={
                      <RefreshCw
                        className={`${s("size-4", "size-3")} text-risk-green`}
                        strokeWidth={1.8}
                      />
                    }
                    value={`${fresh}/${evidence.length}`}
                    label="Fresh sources"
                  />
                </div>
              </div>

              <div
                className={`relative flex flex-col justify-center ${s(
                  "mx-5 mt-[18px] h-[300px]",
                  "mx-4 mt-3 h-[232px]",
                )}`}
              >
                <AqiScale aqi={aqi ?? 0} desktop={desktop} />
                <p
                  className={`max-w-[640px] leading-[1.45] text-ink ${s(
                    "mt-5 text-[18px]",
                    "mt-3.5 text-[14px]",
                  )}`}
                >
                  {verdict.reason}
                </p>
                <div
                  className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-faint ${s(
                    "text-[12px]",
                    "text-[9px]",
                  )}`}
                >
                  <span>Checked {reading ? clockTime(reading.fetchedAt) : "just now"}</span>
                  <span>·</span>
                  <span>{reading?.demo ? "Demo data, not live" : "Live sources"}</span>
                  {aqi === null && <span>· No current AQI value for this place yet</span>}
                </div>

                {verdict.blind_spots.length > 0 && (
                  <div className={`border-t border-border ${s("mt-4 pt-3", "mt-3 pt-2.5")}`}>
                    <div
                      className={`uppercase tracking-[0.1em] text-ink-faint ${s(
                        "text-[10px]",
                        "text-[9px]",
                      )}`}
                    >
                      Disclosed gaps
                    </div>
                    <ul className="mt-1.5 max-w-[620px] space-y-1">
                      {verdict.blind_spots.slice(0, 2).map((spot) => (
                        <li
                          key={spot}
                          className={`flex gap-1.5 leading-[1.4] text-ink-soft ${s(
                            "text-[12px]",
                            "text-[9px]",
                          )}`}
                        >
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
                          <span className="line-clamp-2">{spot}</span>
                        </li>
                      ))}
                    </ul>
                    {verdict.blind_spots.length > 2 && (
                      <div className={`mt-1 text-ink-faint ${s("text-[11px]", "text-[9px]")}`}>
                        +{verdict.blind_spots.length - 2} more disclosed gaps
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Top Regions by AQI */}
        <div
          style={pos(888, lifted(898), 455, 392)}
          className={`rounded-[18px] bg-surface ${desktop ? "" : "mt-6"}`}
        >
          <div
            className={`flex items-center justify-between ${s(
              "px-[22px] pt-[20px]",
              "px-4 pt-3.5",
            )}`}
          >
            <h3 className={`tracking-[-0.01em] text-ink ${s("text-[21px]", "text-[17px]")}`}>
              Top Regions by AQI
            </h3>
          </div>
          <div
            className={`flex justify-between text-ink-faint ${s(
              "mt-[18px] px-[22px] text-[13px]",
              "mt-2.5 px-4 text-[10px]",
            )}`}
          >
            <span>{activeRegion || "Place"}</span>
            <span>Live AQI</span>
          </div>
          <ul className={s("mt-[10px] px-[22px]", "mt-1.5 px-4")}>
            {sortedRows === null ? (
              <>
                <li className="sr-only">Ranking live readings for this region…</li>
                {Array.from({ length: 4 }).map((_, index) => (
                  <li
                    key={index}
                    className={`flex items-center gap-4 border-t border-border text-ink-faint ${s(
                      "h-[66px] text-[13px]",
                      "h-[50px] text-[10px]",
                    )}`}
                  >
                    <span className="h-3 w-28 animate-pulse rounded bg-canvas" />
                    <span className="ml-auto h-3 w-12 animate-pulse rounded bg-canvas" />
                  </li>
                ))}
              </>
            ) : sortedRows.length === 0 ? (
              <li
                className={`flex items-center border-t border-border text-ink-soft ${s(
                  "h-[140px] text-[14px]",
                  "h-[104px] text-[11px]",
                )}`}
              >
                {activeRegion
                  ? "No live readings for this region yet."
                  : "Pick a region above to rank its countries."}
              </li>
            ) : (
              sortedRows.map((row) => (
                <li
                  key={row.name}
                  className={`grid grid-cols-[1fr_auto_1fr] items-center border-t border-border ${s(
                    "h-[66px]",
                    "h-[50px]",
                  )}`}
                >
                  <span className={`truncate pr-2 text-ink ${s("text-[18px]", "text-[14px]")}`}>
                    {row.name}
                  </span>
                  <span
                    className={`rounded-full ${s(
                      "px-2.5 py-1 text-[13px]",
                      "px-2 py-0.5 text-[10px]",
                    )} ${LEVEL_CHIP[row.level] ?? "bg-canvas text-ink-soft"}`}
                  >
                    {row.level || "no data"}
                  </span>
                  <span className={`text-right text-ink ${s("text-[16px]", "text-[13px]")}`}>
                    {row.aqi === null ? "—" : Math.round(row.aqi)}
                    <span className={`text-ink-soft ${s("text-[13px]", "text-[10px]")}`}>/300</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Where This Comes From */}
        <div
          style={pos(1355, lifted(898), 533, 392)}
          className={`rounded-[18px] bg-surface ${desktop ? "" : "mt-6"}`}
        >
          <div
            className={`flex items-center justify-between ${s("px-[21px] pt-[22px]", "px-4 pt-4")}`}
          >
            <h3 className={`tracking-[-0.01em] text-ink ${s("text-[21px]", "text-[17px]")}`}>
              Where This Comes From
            </h3>
            <span className={`text-ink-faint ${s("text-[13px]", "text-[10px]")}`}>
              {evidence.length} {evidence.length === 1 ? "reading" : "readings"}
            </span>
          </div>
          <ul className={`min-h-0 ${s("mt-4 px-[21px]", "mt-2.5 px-4")}`}>
            {status === "loading" || status === "idle" ? (
              <li
                className={`flex items-center text-ink-faint ${s(
                  "h-[120px] text-[14px]",
                  "h-[96px] text-[11px]",
                )}`}
              >
                Loading sources…
              </li>
            ) : sources.length === 0 ? (
              <li
                className={`flex items-center text-ink-soft ${s(
                  "h-[120px] text-[14px]",
                  "h-[96px] text-[11px]",
                )}`}
              >
                No sources answered.
              </li>
            ) : (
              sources.slice(0, 5).map((source) => (
                <li
                  key={source.name}
                  className={`flex items-center justify-between gap-3 border-t border-border first:border-t-0 ${s(
                    "py-2.5",
                    "py-1.5",
                  )}`}
                >
                  <span className={`truncate text-ink ${s("text-[15px]", "text-[12px]")}`}>
                    {source.name}
                  </span>
                  <span className={`shrink-0 text-ink-faint ${s("text-[12px]", "text-[9px]")}`}>
                    {source.count} read{source.count === 1 ? "" : "s"}
                    {source.stale > 0 && ` · ${source.stale} stale`}
                  </span>
                </li>
              ))
            )}
          </ul>
          <div
            className={`flex flex-wrap text-ink ${s(
              "mt-[18px] gap-[26px] px-[21px] text-[13px]",
              "mt-2.5 gap-4 px-4 text-[10px]",
            )}`}
          >
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-risk-green" /> Fresh
              <span className={`ml-1 text-risk-green ${s("text-[16px]", "text-[13px]")}`}>
                {fresh}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-risk-orange" /> Stale
              <span className={`ml-1 text-risk-orange ${s("text-[16px]", "text-[13px]")}`}>
                {evidence.length - fresh}
              </span>
            </span>
          </div>
          <p
            className={`leading-[1.5] text-ink-faint ${s(
              "mt-[14px] px-[21px] text-[11px]",
              "mt-2.5 px-4 text-[9px]",
            )}`}
          >
            Latest observation {timeAgo(latestObservation ?? null)}. Stale readings are
            down-weighted, never hidden.
          </p>
        </div>
      </div>
    </>
  );
}
