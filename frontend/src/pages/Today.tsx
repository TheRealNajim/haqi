import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Share2, Eye, ArrowUpRight, Flame, Wind, Radio, MapPin, RefreshCw, X } from "lucide-react";

import worldMap from "@/assets/world-map.jpg";
import miniMap from "@/assets/mini-map.jpg";
import { COUNTRIES_BY_REGION } from "@/data/geo";
import { countryCenter, type Place } from "@/data/places";
import { loadToday, type TodayReading } from "@/data/today";
import type { PlaceStatus } from "@/hooks/usePlace";
import { useTodayReading } from "@/hooks/useTodayReading";
import type { Evidence } from "@/lib/api";
import { K, canvasPosition } from "@/lib/canvas";

/* ---------- small building blocks ---------- */

function Pin({ n, x, y, onClick }: { n: number; x: number; y: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Region ${n}`}
      className="absolute flex flex-col items-center"
      style={{ left: x * K, top: y * K, transform: "translate(-50%,-50%)" }}
    >
      <span className="relative flex size-[58px] items-center justify-center rounded-full bg-surface/30 backdrop-blur-[1px]">
        <span className="absolute -top-1 text-[16px] font-medium text-surface">{n}</span>
        <span className="mt-4 size-[16px] rounded-full bg-surface shadow" />
      </span>
    </button>
  );
}

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

function AqiScale({ aqi }: { aqi: number }) {
  const marker = Math.min(100, Math.max(0, (aqi / 300) * 100));
  return (
    <div>
      <div className="relative">
        <div className="flex h-3 overflow-hidden rounded-full">
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
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-ink shadow-[var(--shadow-soft)]"
          style={{ left: `${marker}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-ink-faint">
        <span>0</span>
        <span>US AQI scale · live</span>
        <span>300+</span>
      </div>
    </div>
  );
}

function StatTile({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[19px] text-ink">
        {icon} {value}
      </div>
      <div className="text-[12px] text-ink-faint">{label}</div>
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
  active,
  lift = 0,
  onUseMyLocation,
  onViewFullMap,
}: TodayPageProps) {
  const pos = (l: number, t: number, w: number, h: number) => canvasPosition(desktop, l, t, w, h);
  const lifted = (base: number, limit = Infinity) => base - Math.min(lift, limit);

  const [panelOpen, setPanelOpen] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);
  const [topRows, setTopRows] = useState<TopRow[] | null>(null);

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

  return (
    <>
      {/* Title */}
      <div style={pos(119, 120, 700, 90)} className={desktop ? "" : "mt-6"}>
        <h1 className="font-display text-[42px] leading-[1.25] tracking-[-0.01em] text-ink">
          World Risk Map
        </h1>
        <p className="mt-1 text-[18px] text-ink-soft">
          Live air quality for the place you are looking at.
        </p>
      </div>
      <button
        onClick={share}
        style={pos(1592, 141, 116, 48)}
        className={`flex items-center justify-center gap-2 rounded-[10px] bg-surface text-[18px] text-ink ${desktop ? "" : "h-10 px-5"}`}
      >
        Share <Share2 className="size-4" strokeWidth={1.6} />
      </button>
      <button
        onClick={onViewFullMap}
        style={pos(1729, 141, 160, 48)}
        className={`flex items-center justify-center gap-2 rounded-[10px] bg-ink text-[18px] text-surface ${desktop ? "" : "h-10 px-5"}`}
      >
        View Full Map <Eye className="size-5" strokeWidth={1.6} />
      </button>

      {/* Pins */}
      {desktop && (
        <>
          <Pin n={1} x={735} y={530} onClick={() => setPanelOpen(true)} />
          <Pin n={2} x={1218} y={330} onClick={() => setPanelOpen(true)} />
          <Pin n={6} x={1250} y={603} onClick={() => setPanelOpen(true)} />
          <Pin n={5} x={735} y={738} onClick={() => setPanelOpen(true)} />
        </>
      )}

      {!desktop && (
        <img
          src={worldMap}
          alt="Relief world map coloured by risk level"
          width={1920}
          height={1280}
          className="mt-6 w-full rounded-[18px]"
        />
      )}

      {/* Area panel */}
      {panelOpen && (
        <div
          style={pos(1365, lifted(365, 165), 445, 443)}
          className={desktop ? "" : "relative mt-8 h-[560px]"}
        >
          <button
            onClick={() => setPanelOpen(false)}
            aria-label="Close"
            className="absolute left-1/2 top-0 z-10 flex size-[72px] -translate-x-[15%] items-center justify-center rounded-full bg-surface text-ink shadow-[var(--shadow-soft)] ring-8 ring-canvas/70"
          >
            <X className="size-7" strokeWidth={1.8} />
          </button>
          <Card className="absolute inset-x-0 bottom-0 top-[40px] overflow-hidden bg-surface/90 backdrop-blur">
            <div className="px-[21px] pt-[52px]">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[26px] tracking-[-0.01em] text-ink">
                    {place?.label ?? "Your area"}
                  </h3>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    {placeNote ??
                      (place?.source === "ip"
                        ? "Approximate location from your network"
                        : "Chosen in the filters above")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[15px] text-ink-faint">Current AQI</div>
                  <div
                    className={`text-[26px] ${aqi === null ? "text-ink-faint" : "text-risk-red"}`}
                  >
                    {aqi === null ? "—" : Math.round(aqi)}
                    <span className="text-[19px] text-ink-faint">/300</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 text-[15px]">
                <div>
                  <div className="flex items-center gap-2 text-ink">
                    <span
                      className={`size-2 rounded-full ring-4 ${LEVEL_DOT[level] ?? "bg-ink-faint ring-canvas"}`}
                    />{" "}
                    {level || "No reading"}
                  </div>
                  <div className="mt-1.5 text-ink-faint">Right now</div>
                </div>
                <div className="border-l border-border pl-5">
                  <div className="flex items-center gap-2 text-ink">
                    <span className="size-2 rounded-full bg-risk-teal ring-4 ring-canvas" /> Primary
                    signal
                  </div>
                  <div className="mt-1.5 text-ink-faint">
                    {strongest ? sourceName(strongest.source_id) : "No source"}
                  </div>
                </div>
                <div className="border-l border-border pl-5">
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
            <img
              src={miniMap}
              alt="Map preview for this location"
              loading="lazy"
              width={1152}
              height={576}
              className="absolute bottom-0 left-0 h-[230px] w-full object-cover object-[60%_40%]"
            />
          </Card>
        </div>
      )}

      {/* Air Quality in Your Area */}
      <div
        style={pos(120, lifted(795), 758, 495)}
        className={`rounded-[18px] bg-surface ${desktop ? "" : "mt-6 overflow-x-auto"}`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h3 className="text-[21px] tracking-[-0.01em] text-ink">Air Quality in Your Area</h3>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onUseMyLocation}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-ink/25 hover:bg-canvas"
            >
              <MapPin className="size-3" strokeWidth={1.9} />
              Use my location
            </button>
            <button
              onClick={() => setPanelOpen(true)}
              aria-label="Open air quality detail"
              className="flex size-[50px] items-center justify-center rounded-full border border-border text-ink"
            >
              <ArrowUpRight className="size-5" strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {placeStatus === "empty" ? (
          <div className="mt-8 px-5">
            <p className="max-w-[520px] text-[16px] leading-[1.55] text-ink-soft">
              A whole region has no single air reading. Pick a country above and HAQI will load live
              numbers for it.
            </p>
          </div>
        ) : status === "loading" || status === "idle" ? (
          <div aria-busy="true" className="mt-6 px-5">
            <span className="sr-only">Loading the air-quality reading</span>
            <div className="h-5 w-40 animate-pulse rounded bg-canvas" />
            <div className="mt-3 h-12 w-32 animate-pulse rounded bg-canvas" />
            <div className="mt-6 h-3 w-full animate-pulse rounded bg-canvas" />
          </div>
        ) : status === "error" || !verdict ? (
          <div className="mt-8 px-5">
            <p className="max-w-[520px] text-[16px] leading-[1.55] text-ink-soft">
              {error ?? "HAQI could not load this reading."}
            </p>
            <button
              onClick={retry}
              className="mt-4 inline-flex items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-[13px] text-ink hover:bg-canvas"
            >
              <RefreshCw className="size-3.5" strokeWidth={1.8} /> Try again
            </button>
          </div>
        ) : (
          <>
            <div className="mt-[18px] flex justify-between gap-6 px-5">
              <div>
                <div className="text-[21px] text-ink-faint">Current AQI</div>
                <div className="mt-1 text-[44px] tracking-[-0.02em] text-ink">
                  {aqi === null ? "—" : Math.round(aqi)}
                  <span className="text-[19px] text-ink-faint">/300</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[12px] ${LEVEL_CHIP[level] ?? "bg-canvas text-ink-soft"}`}
                  >
                    {level || "No reading"}
                  </span>
                  <span className="text-[12px] text-ink-faint">{place?.label}</span>
                </div>
              </div>
              <div className="mr-[-18px] grid grid-cols-2 gap-x-[38px] gap-y-[34px] pt-0">
                <StatTile
                  icon={<Radio className="size-4 text-risk-teal" strokeWidth={1.8} />}
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
                  icon={<Wind className="size-4 text-risk-green" strokeWidth={1.8} />}
                  value={wind ? `${short(wind.raw_value)} ${wind.unit}` : "—"}
                  label="Wind next 3h"
                />
                <StatTile
                  icon={<Flame className="size-4 fill-risk-orange text-risk-orange" />}
                  value={fire ? short(fire.raw_value, 0) : "—"}
                  label="Fire hotspots, 50 km"
                />
                <StatTile
                  icon={<RefreshCw className="size-4 text-risk-green" strokeWidth={1.8} />}
                  value={`${fresh}/${evidence.length}`}
                  label="Fresh sources"
                />
              </div>
            </div>

            <div className="relative mx-5 mt-[18px] flex h-[300px] flex-col justify-center">
              <AqiScale aqi={aqi ?? 0} />
              <p className="mt-5 max-w-[640px] text-[18px] leading-[1.45] text-ink">
                {verdict.reason}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
                <span>Checked {reading ? clockTime(reading.fetchedAt) : "just now"}</span>
                <span>·</span>
                <span>{reading?.demo ? "Demo data, not live" : "Live sources"}</span>
                {aqi === null && <span>· No current AQI value for this place yet</span>}
              </div>

              {verdict.blind_spots.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                    Disclosed gaps
                  </div>
                  <ul className="mt-1.5 max-w-[620px] space-y-1">
                    {verdict.blind_spots.slice(0, 2).map((spot) => (
                      <li
                        key={spot}
                        className="flex gap-1.5 text-[12px] leading-[1.4] text-ink-soft"
                      >
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
                        <span className="line-clamp-2">{spot}</span>
                      </li>
                    ))}
                  </ul>
                  {verdict.blind_spots.length > 2 && (
                    <div className="mt-1 text-[11px] text-ink-faint">
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
        <div className="flex items-center justify-between px-[22px] pt-[20px]">
          <h3 className="text-[21px] tracking-[-0.01em] text-ink">Top Regions by AQI</h3>
        </div>
        <div className="mt-[18px] flex justify-between px-[22px] text-[13px] text-ink-faint">
          <span>{activeRegion || "Place"}</span>
          <span>Live AQI</span>
        </div>
        <ul className="mt-[10px] px-[22px]">
          {sortedRows === null ? (
            <>
              <li className="sr-only">Ranking live readings for this region…</li>
              {Array.from({ length: 4 }).map((_, index) => (
                <li
                  key={index}
                  className="flex h-[66px] items-center gap-4 border-t border-border text-[13px] text-ink-faint"
                >
                  <span className="h-3 w-28 animate-pulse rounded bg-canvas" />
                  <span className="ml-auto h-3 w-12 animate-pulse rounded bg-canvas" />
                </li>
              ))}
            </>
          ) : sortedRows.length === 0 ? (
            <li className="flex h-[140px] items-center border-t border-border text-[14px] text-ink-soft">
              {activeRegion
                ? "No live readings for this region yet."
                : "Pick a region above to rank its countries."}
            </li>
          ) : (
            sortedRows.map((row) => (
              <li
                key={row.name}
                className="grid h-[66px] grid-cols-[1fr_auto_1fr] items-center border-t border-border"
              >
                <span className="truncate pr-2 text-[18px] text-ink">{row.name}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[13px] ${LEVEL_CHIP[row.level] ?? "bg-canvas text-ink-soft"}`}
                >
                  {row.level || "no data"}
                </span>
                <span className="text-right text-[16px] text-ink">
                  {row.aqi === null ? "—" : Math.round(row.aqi)}
                  <span className="text-[13px] text-ink-soft">/300</span>
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
        <div className="flex items-center justify-between px-[21px] pt-[22px]">
          <h3 className="text-[21px] tracking-[-0.01em] text-ink">Where This Comes From</h3>
          <span className="text-[13px] text-ink-faint">
            {evidence.length} {evidence.length === 1 ? "reading" : "readings"}
          </span>
        </div>
        <ul className="mt-4 min-h-0 px-[21px]">
          {status === "loading" || status === "idle" ? (
            <li className="flex h-[120px] items-center text-[14px] text-ink-faint">
              Loading sources…
            </li>
          ) : sources.length === 0 ? (
            <li className="flex h-[120px] items-center text-[14px] text-ink-soft">
              No sources answered.
            </li>
          ) : (
            sources.slice(0, 5).map((source) => (
              <li
                key={source.name}
                className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0"
              >
                <span className="truncate text-[15px] text-ink">{source.name}</span>
                <span className="shrink-0 text-[12px] text-ink-faint">
                  {source.count} read{source.count === 1 ? "" : "s"}
                  {source.stale > 0 && ` · ${source.stale} stale`}
                </span>
              </li>
            ))
          )}
        </ul>
        <div className="mt-[18px] flex flex-wrap gap-[26px] px-[21px] text-[13px] text-ink">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-risk-green" /> Fresh
            <span className="ml-1 text-[16px] text-risk-green">{fresh}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-risk-orange" /> Stale
            <span className="ml-1 text-[16px] text-risk-orange">{evidence.length - fresh}</span>
          </span>
        </div>
        <p className="mt-[14px] px-[21px] text-[11px] leading-[1.5] text-ink-faint">
          Latest observation {timeAgo(latestObservation ?? null)}. Stale readings are down-weighted,
          never hidden.
        </p>
      </div>
    </>
  );
}
