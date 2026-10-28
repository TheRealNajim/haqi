import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BadgeQuestionMark, Map as MapIcon, MessageCircle, X } from "lucide-react";
import { type LucideIcon } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { WorldMap, type AqiMarker, type MapSelection } from "@/components/map/WorldMap";
import { AREAS_BY_COUNTRY, COUNTRIES_BY_REGION } from "@/data/geo";
import { appAreaFor, appCountryFor } from "@/data/world";
import { usePlace } from "@/hooks/usePlace";
import { useTodayReading } from "@/hooks/useTodayReading";
import { H, K, W } from "@/lib/canvas";
import { useRoute, type Screen } from "@/lib/router";
import { TodayPage } from "@/pages/Today";
import { AskPage } from "@/pages/Ask";
import { WhyPage } from "@/pages/Why";

const NAV: { icon: LucideIcon; label: string; screen: Screen; filled?: boolean }[] = [
  // Today keeps the icon and filled look the old active "Risk Map" item had.
  { icon: MapIcon, label: "Today", screen: "today", filled: true },
  { icon: MessageCircle, label: "Ask", screen: "ask" },
  { icon: BadgeQuestionMark, label: "Why", screen: "why" },
];

/**
 * Screen layers sit ON TOP of the shared background map, so the layer itself
 * never takes pointer events — the cards and controls inside opt back in and
 * everything else falls through to the map underneath.
 */
const screenLayer = (active: boolean, immersive: boolean) =>
  `absolute inset-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
    active
      ? `pointer-events-auto translate-y-0 ${immersive ? "opacity-0" : "opacity-100"}`
      : "pointer-events-none -translate-y-3 opacity-0"
  }`;

/**
 * Where the map background sits, in design units — the exact rect the static
 * backdrop image used to occupy, so the live relief drops into the same place
 * in the artwork on all three screens.
 */
// The page must paint at its final size: the first render is measured here so
// the canvas never appears oversized and then shrinks on refresh.
const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth || 1;
const viewportHeight = () => window.innerHeight || 1;

/**
 * How far the Today cards may be lifted so they fit in the window without
 * scrolling. They keep their size; only their top edge moves up.
 */
const CARDS_BOTTOM = 1290;
const MAX_LIFT = 250;
const BOTTOM_MARGIN = 8;

export function HomePage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() => viewportWidth() / W);
  const [lift, setLift] = useState(0);
  const [desktop, setDesktop] = useState(() => window.innerWidth >= 1100);
  const {
    region,
    country,
    area,
    state: placeState,
    selectRegion,
    selectCountry,
    selectArea,
    useMyLocation,
  } = usePlace();
  const [riskType, setRiskType] = useState("");
  const [navHover, setNavHover] = useState<{ label: string; top: number } | null>(null);
  const [query, setQuery] = useState("");
  const [immersive, setImmersive] = useState(false);
  const [mapSelection, setMapSelection] = useState<MapSelection | null>(null);
  const { screen, navigate } = useRoute();
  const { reading } = useTodayReading(placeState.place, screen === "today");

  const closeImmersive = useCallback(() => setImmersive(false), []);
  const openImmersive = useCallback(() => setImmersive(true), []);

  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeImmersive();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [immersive, closeImmersive]);

  /**
   * The map and the header filters share one idea of "the place you are looking
   * at": choosing a country on the map brings the reading with it.
   */
  const handleMapSelect = useCallback(
    (selection: MapSelection | null) => {
      setMapSelection(selection);
      if (!selection) return;

      if (selection.kind === "state") {
        selectRegion("Africa");
        selectCountry("Nigeria");
        selectArea(appAreaFor(selection.name));
        return;
      }

      const match = appCountryFor(selection.name);
      if (match) {
        selectRegion(match.region);
        selectCountry(match.country);
      }
    },
    [selectArea, selectCountry, selectRegion],
  );

  const mapMarkers = useMemo<AqiMarker[]>(() => {
    const place = placeState.place;
    if (!reading || !place) return [];
    const verdict = reading.verdict;
    const strongest = [...verdict.evidence].sort((a, b) => b.weight - a.weight)[0];
    const observedAt =
      verdict.evidence
        .map((item) => item.observed_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    return [
      {
        id: "current-place",
        name: place.label,
        lat: place.lat,
        lon: place.lon,
        aqi: verdict.aqi,
        level: verdict.level,
        observedAt,
        source: (strongest ? strongest.source_id.split(":")[0] : null) ?? "HAQI verdict",
        demo: reading.demo,
        detail: strongest?.claim ?? verdict.reason,
      },
    ];
  }, [reading, placeState.place]);

  useLayoutEffect(() => {
    const update = () => {
      const w = wrapRef.current?.clientWidth || viewportWidth();
      const nextDesktop = window.innerWidth >= 1100;
      const nextScale = w / W;
      const overflow = (CARDS_BOTTOM + BOTTOM_MARGIN) * K * nextScale - viewportHeight();
      setDesktop(nextDesktop);
      setScale(nextScale);
      setLift(nextDesktop ? Math.min(MAX_LIFT, Math.max(0, overflow / (K * nextScale))) : 0);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const setFilter = (key: string, value: string) => {
    if (key === "region") {
      selectRegion(value === "Select Region" ? "" : value);
    } else if (key === "country") {
      selectCountry(value === "Select Country" ? "" : value);
    } else if (key === "area") {
      selectArea(value === "Select Area" ? "" : value);
    } else {
      setRiskType(value === "All Risk Type" ? "" : value);
    }
  };

  // Options cascade: each filter only offers values that belong to its parent.
  const filterOptions = {
    region: ["Select Region", ...Object.keys(COUNTRIES_BY_REGION)],
    country: region ? ["Select Country", ...(COUNTRIES_BY_REGION[region] ?? [])] : [],
    area: country ? ["Select Area", ...(AREAS_BY_COUNTRY[country] ?? [])] : [],
    riskType: ["All Risk Type", "Wildfire", "Flood", "Water Stress", "Extreme Heat"],
  };

  const filterValues = {
    region: region || "Select Region",
    country: region ? country || "Select Country" : "Select region first",
    area: country ? area || "Select Area" : "Select country first",
    riskType: riskType || "All Risk Type",
  };

  const activeNav = NAV.findIndex((item) => item.screen === screen);

  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, next: Screen) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setNavHover(null);
    navigate(next);
  };

  const navLink = (item: (typeof NAV)[number], index: number) => {
    const active = activeNav === index;
    return (
      <a
        key={item.label}
        href={"/"}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        onClick={(event) => handleNavClick(event, item.screen)}
        onMouseMove={(event) => {
          if (!desktop) return;
          const rect = event.currentTarget.getBoundingClientRect();
          setNavHover({
            label: item.label,
            top: (127 + index * 69) * K + (event.clientY - rect.top) / scale - 14 * K,
          });
        }}
        onMouseLeave={() => setNavHover(null)}
        style={
          desktop
            ? { left: 29 * K, top: (127 + index * 69) * K, width: 64 * K, height: 64 * K }
            : undefined
        }
        className={
          desktop
            ? "absolute z-20 flex cursor-pointer items-center justify-center rounded-[10px] bg-surface text-ink"
            : `flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
                active ? "bg-ink text-surface" : "bg-surface text-ink-soft"
              }`
        }
      >
        {active && desktop && (
          <span className="absolute -left-[3px] top-[10px] h-[44px] w-[2px] rounded bg-ink" />
        )}
        <item.icon
          className={desktop ? "size-[26px]" : "size-4"}
          strokeWidth={active ? (desktop ? 2.4 : 2.2) : desktop ? 1.4 : 1.5}
          fill={active && item.filled ? "currentColor" : "none"}
        />
        {!desktop && item.label}
      </a>
    );
  };

  const header = (
    <AppHeader
      desktop={desktop}
      query={query}
      onQueryChange={setQuery}
      filters={filterValues}
      filterOptions={filterOptions}
      disabledFilters={{ country: !region, area: !country }}
      showFilters={desktop || screen === "today"}
      onFilterChange={setFilter}
      screen={screen}
      mobileNav={
        <nav aria-label="Screens" className="flex gap-2">
          {NAV.map((item, index) => navLink(item, index))}
        </nav>
      }
    />
  );

  const sidebar = desktop ? (
    <>
      {NAV.map((item, index) => navLink(item, index))}
      {navHover && (
        <div
          role="tooltip"
          style={{
            left: 107 * K,
            top: navHover.top,
          }}
          className="pointer-events-none absolute z-50 whitespace-nowrap rounded-[8px] bg-ink px-2.5 py-1.5 text-[13px] leading-none text-surface shadow-[var(--shadow-soft)]"
        >
          <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rotate-45 rounded-[2px] bg-ink" />
          {navHover.label}
        </div>
      )}
    </>
  ) : null;

  return (
    <div ref={wrapRef} className="relative min-h-screen w-full bg-white">
      <div
        className={`fixed inset-0 overflow-hidden ${
          immersive ? "pointer-events-auto z-50" : "pointer-events-none z-0"
        }`}
      >
        <WorldMap
          selected={mapSelection}
          onSelect={handleMapSelect}
          markers={mapMarkers}
          immersive={immersive}
          onImmersiveChange={(next) => (next ? openImmersive() : closeImmersive())}
        />
      </div>
      {desktop ? (
        <div style={{ height: H * scale }} className="relative z-10 overflow-hidden">
          <div
            className="absolute left-0 top-0 origin-top-left overflow-hidden"
            style={{ width: W, height: H, transform: `scale(${scale})` }}
          >
            <div
              className={screenLayer(screen === "today", immersive)}
              aria-hidden={screen !== "today"}
              inert={screen !== "today"}
            >
              <TodayPage
                desktop
                place={placeState.place}
                placeStatus={placeState.status}
                placeNote={placeState.note}
                region={region}
                country={country}
                area={area}
                active={screen === "today"}
                lift={lift}
                onUseMyLocation={useMyLocation}
                onViewFullMap={openImmersive}
              />
            </div>

            <div
              className={screenLayer(screen === "ask", immersive)}
              aria-hidden={screen !== "ask"}
              inert={screen !== "ask"}
            >
              <AskPage desktop onViewFullMap={openImmersive} onViewWhy={() => navigate("why")} />
            </div>

            <div
              className={screenLayer(screen === "why", immersive)}
              aria-hidden={screen !== "why"}
              inert={screen !== "why"}
            >
              <WhyPage desktop onViewFullMap={openImmersive} />
            </div>

            {header}
            {sidebar}
          </div>
        </div>
      ) : (
        <div className="relative z-10 min-h-screen overflow-hidden px-4 py-6">
          <div className="relative z-10">{header}</div>
          <div
            className={`relative z-10 transition-opacity duration-700 ${immersive ? "opacity-0" : "opacity-100"} ${screen === "today" ? "screen-in" : "hidden"}`}
            aria-hidden={screen !== "today"}
            inert={screen !== "today"}
          >
            <TodayPage
              desktop={false}
              place={placeState.place}
              placeStatus={placeState.status}
              placeNote={placeState.note}
              region={region}
              country={country}
              area={area}
              active={screen === "today"}
              onUseMyLocation={useMyLocation}
              onViewFullMap={openImmersive}
            />
          </div>
          <div
            className={`relative z-10 transition-opacity duration-700 ${immersive ? "opacity-0" : "opacity-100"} ${screen === "ask" ? "screen-in" : "hidden"}`}
            aria-hidden={screen !== "ask"}
            inert={screen !== "ask"}
          >
            <AskPage
              desktop={false}
              onViewFullMap={openImmersive}
              onViewWhy={() => navigate("why")}
            />
          </div>
          <div
            className={`relative z-10 transition-opacity duration-700 ${immersive ? "opacity-0" : "opacity-100"} ${screen === "why" ? "screen-in" : "hidden"}`}
            aria-hidden={screen !== "why"}
            inert={screen !== "why"}
          >
            <WhyPage desktop={false} onViewFullMap={openImmersive} />
          </div>
        </div>
      )}
    </div>
  );
}
