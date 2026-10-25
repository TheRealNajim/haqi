import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Map as MapIcon, MessageCircle, BadgeQuestionMark, X, type LucideIcon } from "lucide-react";

import worldMap from "@/assets/world-map.jpg";
import { AppHeader, type HeaderFilterKey } from "@/components/AppHeader";
import { AREAS_BY_COUNTRY, COUNTRIES_BY_REGION } from "@/data/geo";
import { H, K, W, canvasPosition } from "@/lib/canvas";
import { SCREEN_PATHS, useRoute, type Screen } from "@/lib/router";
import { AskPage } from "@/pages/Ask";
import { TodayPage } from "@/pages/Today";
import { WhyPage } from "@/pages/Why";

const NAV: { icon: LucideIcon; label: string; screen: Screen; filled?: boolean }[] = [
  // Today keeps the icon and filled look the old active "Risk Map" item had.
  { icon: MapIcon, label: "Today", screen: "today", filled: true },
  { icon: MessageCircle, label: "Ask", screen: "ask" },
  { icon: BadgeQuestionMark, label: "Why", screen: "why" },
];

const screenLayer = (active: boolean) =>
  `absolute inset-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
    active ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
  }`;

function ImmersiveMap({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full air-quality map"
      className={`fixed inset-0 z-50 flex flex-col bg-canvas ${closing ? "map-exit" : "map-enter"}`}
    >
      <img
        src={worldMap}
        alt="Relief world map coloured by risk level"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-canvas/15" />

      <div className="relative flex items-start justify-between gap-4 p-5 sm:p-7">
        <div className="rounded-[14px] border border-border bg-surface px-5 py-4 shadow-[var(--shadow-soft)]">
          <p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Full map</p>
          <h2 className="mt-1 text-[20px] leading-tight text-ink">World Risk Map</h2>
          <p className="mt-1 text-[12px] text-ink-faint">Static relief map · demo preview</p>
        </div>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Exit full map"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-[var(--shadow-soft)] transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <X className="size-5" strokeWidth={1.6} />
        </button>
      </div>

      <div className="relative mt-auto flex flex-wrap items-end justify-between gap-4 p-5 sm:p-7">
        <p className="max-w-[340px] text-[12px] leading-[1.55] text-ink-soft">
          The map is a static relief image in this build. Press Esc or use the close button to
          return to the screen you came from.
        </p>
        <div className="rounded-[14px] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-soft)]">
          <p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Risk level</p>
          <div className="mt-2 flex gap-4 text-[12px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-risk-green" /> Low
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-risk-yellow" /> Moderate
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-risk-red" /> High
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// The page must paint at its final size: the first render is measured here so
// the canvas never appears oversized and then shrinks on refresh.
const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth || 1;

export function HomePage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() => viewportWidth() / W);
  const [desktop, setDesktop] = useState(() => window.innerWidth >= 1100);
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [area, setArea] = useState("");
  const [riskType, setRiskType] = useState("");
  const [months, setMonths] = useState("12 months");
  const [navHover, setNavHover] = useState<{ label: string; top: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sortDesc, setSortDesc] = useState(false);
  const [query, setQuery] = useState("");
  const [immersive, setImmersive] = useState(false);
  const [immersiveClosing, setImmersiveClosing] = useState(false);
  const immersiveTimer = useRef<number | null>(null);
  const { screen, navigate } = useRoute();

  const closeImmersive = useCallback(() => {
    setImmersiveClosing(true);
    immersiveTimer.current = window.setTimeout(() => {
      setImmersive(false);
      setImmersiveClosing(false);
      immersiveTimer.current = null;
    }, 180);
  }, []);

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

  useEffect(() => {
    return () => {
      if (immersiveTimer.current) window.clearTimeout(immersiveTimer.current);
    };
  }, []);

  const openImmersive = () => {
    if (immersiveTimer.current) {
      window.clearTimeout(immersiveTimer.current);
      immersiveTimer.current = null;
    }
    setImmersiveClosing(false);
    setImmersive(true);
  };

  useLayoutEffect(() => {
    const update = () => {
      const w = wrapRef.current?.clientWidth || viewportWidth();
      setDesktop(window.innerWidth >= 1100);
      setScale(w / W);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const setFilter = (key: HeaderFilterKey, value: string) => {
    if (key === "region") {
      setRegion(value === "Select Region" ? "" : value);
      setCountry("");
      setArea("");
    } else if (key === "country") {
      setCountry(value === "Select Country" ? "" : value);
      setArea("");
    } else if (key === "area") {
      setArea(value === "Select Area" ? "" : value);
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
    />
  );

  const activeNav = NAV.findIndex((item) => item.screen === screen);

  const handleNavClick = (event: ReactMouseEvent<HTMLAnchorElement>, next: Screen) => {
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
        href={SCREEN_PATHS[item.screen]}
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
        style={desktop ? canvasPosition(true, 29, 127 + index * 69, 64, 64) : undefined}
        className={
          desktop
            ? "z-20 flex cursor-pointer items-center justify-center rounded-[10px] bg-surface text-ink"
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
    <div ref={wrapRef} className="min-h-screen w-full bg-canvas">
      {desktop ? (
        <div style={{ height: H * scale }} className="overflow-hidden">
          <div
            className="relative origin-top-left overflow-hidden bg-canvas"
            style={{ width: W, height: H, transform: `scale(${scale})` }}
          >
            {/* The map is the shared backdrop for every screen; it never remounts. */}
            <img
              src={worldMap}
              alt="Relief world map coloured by risk level"
              width={1920}
              height={1280}
              className="pointer-events-none absolute select-none"
              style={{
                left: -120 * K,
                top: 170 * K,
                width: 1728 * K,
                maskImage:
                  "radial-gradient(ellipse 70% 70% at 50% 50%, black 60%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 70% 70% at 50% 50%, black 60%, transparent 100%)",
              }}
            />

            <div
              className={screenLayer(screen === "today")}
              aria-hidden={screen !== "today"}
              inert={screen !== "today"}
            >
              <TodayPage
                desktop
                query={query}
                months={months}
                onMonthsChange={setMonths}
                panelOpen={panelOpen}
                onPanelOpenChange={setPanelOpen}
                sortDesc={sortDesc}
                onSortDescChange={setSortDesc}
                onViewFullMap={openImmersive}
              />
            </div>

            <div
              className={screenLayer(screen === "ask")}
              aria-hidden={screen !== "ask"}
              inert={screen !== "ask"}
            >
              <AskPage desktop onViewFullMap={openImmersive} />
            </div>

            <div
              className={screenLayer(screen === "why")}
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
        <div className="relative px-4 py-6">
          {header}
          <nav aria-label="Screens" className="mt-4 flex gap-2">
            {NAV.map((item, index) => navLink(item, index))}
          </nav>
          <div
            className={screen === "today" ? "screen-in" : "hidden"}
            aria-hidden={screen !== "today"}
            inert={screen !== "today"}
          >
            <TodayPage
              desktop={false}
              query={query}
              months={months}
              onMonthsChange={setMonths}
              panelOpen={panelOpen}
              onPanelOpenChange={setPanelOpen}
              sortDesc={sortDesc}
              onSortDescChange={setSortDesc}
              onViewFullMap={openImmersive}
            />
          </div>
          <div
            className={screen === "ask" ? "screen-in" : "hidden"}
            aria-hidden={screen !== "ask"}
            inert={screen !== "ask"}
          >
            <AskPage desktop={false} onViewFullMap={openImmersive} />
          </div>
          <div
            className={screen === "why" ? "screen-in" : "hidden"}
            aria-hidden={screen !== "why"}
            inert={screen !== "why"}
          >
            <WhyPage desktop={false} onViewFullMap={openImmersive} />
          </div>
        </div>
      )}

      {immersive && <ImmersiveMap closing={immersiveClosing} onClose={closeImmersive} />}
    </div>
  );
}
