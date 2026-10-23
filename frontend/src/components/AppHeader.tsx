import { useState } from "react";
import { Bell, Moon, Search, Sun } from "lucide-react";

import { Dropdown } from "@/components/Dropdown";
import { K, canvasPosition } from "@/lib/canvas";

export type HeaderFilters = {
  region: string;
  country: string;
  area: string;
  riskType: string;
};

export type HeaderFilterKey = keyof HeaderFilters;

const FILTER_KEYS: HeaderFilterKey[] = ["region", "country", "area", "riskType"];

const FILTER_WIDTHS: Record<HeaderFilterKey, number> = {
  region: 156,
  country: 164,
  area: 174,
  riskType: 152,
};

type AppHeaderProps = {
  /** Lay the header out on the 1920-wide canvas used by the dashboard. */
  desktop?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  filters: HeaderFilters;
  filterOptions: Record<HeaderFilterKey, string[]>;
  disabledFilters?: Partial<Record<HeaderFilterKey, boolean>>;
  onFilterChange: (key: HeaderFilterKey, value: string) => void;
};

export function AppHeader({
  desktop = false,
  query,
  onQueryChange,
  filters,
  filterOptions,
  disabledFilters,
  onFilterChange,
}: AppHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("haqi-theme");
    const next = stored ? stored === "dark" : false;
    document.documentElement.classList.toggle("dark", next);
    return next;
  });

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("haqi-theme", next ? "dark" : "light");
      return next;
    });
  };

  return (
    <header className={desktop ? "contents" : "flex flex-wrap items-center gap-3"}>
      <div style={canvasPosition(desktop, 28, 31, 42, 56)} className="flex items-center text-ink">
        <svg viewBox="0 0 42 46" className="size-[42px]" fill="currentColor">
          <circle cx="8" cy="8" r="5" />
          <circle cx="24" cy="6" r="5.5" />
          <circle cx="36" cy="16" r="5" />
          <circle cx="18" cy="20" r="6" />
          <circle cx="6" cy="28" r="5" />
          <circle cx="30" cy="30" r="5.5" />
          <circle cx="16" cy="38" r="5" />
        </svg>
      </div>

      <div
        style={
          desktop
            ? {
                position: "absolute",
                left: 389 * K,
                // Vertically centred against the 56-tall logo block.
                top: 35 * K,
                width: 1499 * K,
                height: 48 * K,
              }
            : undefined
        }
        className={`flex flex-wrap items-stretch gap-3.5 ${
          desktop
            ? ""
            : "w-full min-[900px]:w-auto min-[900px]:flex-1 min-[900px]:flex-nowrap min-[900px]:items-center"
        }`}
      >
        <label
          style={desktop ? { width: 560 * K } : undefined}
          className={`flex items-center gap-3 rounded-[10px] bg-surface px-4 ${
            desktop
              ? ""
              : "h-10 w-full min-[900px]:w-auto min-[900px]:min-w-[150px] min-[900px]:flex-1"
          }`}
        >
          <Search className="size-5" strokeWidth={1.4} />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[16px] text-ink placeholder:text-ink outline-none"
          />
        </label>

        {FILTER_KEYS.map((key) => (
          <div
            key={key}
            style={desktop ? { width: FILTER_WIDTHS[key] * K } : undefined}
            className={
              desktop ? "" : "h-10 min-w-[132px] flex-1 min-[900px]:min-w-0 min-[900px]:flex-none"
            }
          >
            <Dropdown
              className="h-full"
              value={filters[key]}
              onChange={(value) => onFilterChange(key, value)}
              options={filterOptions[key]}
              disabled={Boolean(disabledFilters?.[key])}
              small={!desktop}
            />
          </div>
        ))}

        <div
          style={desktop ? { marginLeft: 73 * K } : undefined}
          className="flex shrink-0 items-stretch gap-3"
        >
          <div
            style={desktop ? { width: 48 * K } : undefined}
            className={`relative ${desktop ? "" : "h-10 w-10"}`}
          >
            <button
              onClick={() => setNotifOpen((open) => !open)}
              aria-label="Notifications"
              className="relative flex h-full w-full items-center justify-center rounded-[10px] bg-surface text-ink"
            >
              <Bell className="size-5" strokeWidth={1.4} />
              <span
                className={`absolute size-2 rounded-full bg-risk-red ${
                  desktop ? "right-3 top-2" : "right-2.5 top-2"
                }`}
              />
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-[12px] bg-surface p-4 text-[14px] text-ink-soft shadow-[var(--shadow-soft)]">
                Flood risk increased in Egypt Operations.
              </div>
            )}
          </div>

          <button
            onClick={toggleTheme}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            style={desktop ? { width: 48 * K, height: 48 * K } : undefined}
            className={`flex items-center justify-center rounded-[10px] bg-surface text-ink ${
              desktop ? "" : "size-10"
            }`}
          >
            {dark ? (
              <Moon className="size-5" strokeWidth={1.4} />
            ) : (
              <Sun className="size-5" strokeWidth={1.4} />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
