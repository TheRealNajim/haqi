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

type HeaderNotification = {
  id: string;
  message: string;
  read: boolean;
};

const INITIAL_NOTIFICATIONS: HeaderNotification[] = [
  { id: "flood-egypt", message: "Flood risk increased in Egypt Operations.", read: false },
];

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
  /** Hide the map filters where they are not relevant (mobile Ask). */
  showFilters?: boolean;
  onFilterChange: (key: HeaderFilterKey, value: string) => void;
};

export function AppHeader({
  desktop = false,
  query,
  onQueryChange,
  filters,
  filterOptions,
  disabledFilters,
  showFilters = true,
  onFilterChange,
}: AppHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<HeaderNotification[]>(INITIAL_NOTIFICATIONS);
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("haqi-theme");
    const next = stored ? stored === "dark" : false;
    document.documentElement.classList.toggle("dark", next);
    return next;
  });

  const unreadCount = notifications.filter((item) => !item.read).length;

  const markAllRead = () =>
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));

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
      <div style={canvasPosition(desktop, 23, 33, 52, 52)} className="flex shrink-0 items-center">
        <img
          src={dark ? "/favicon-dark-mode.png" : "/favicon-light-mode.png"}
          alt="haqi"
          width={2000}
          height={2000}
          className={`select-none ${desktop ? "h-full w-full" : "size-[42px]"} ${
            dark ? "mix-blend-screen" : "mix-blend-multiply"
          }`}
        />
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
          className={`flex items-center gap-3 rounded-[10px] border border-border bg-surface px-4 shadow-[var(--shadow-soft)] ${
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

        {showFilters &&
          FILTER_KEYS.map((key) => (
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
              className="relative flex h-full w-full items-center justify-center rounded-[10px] border border-border bg-surface text-ink shadow-[var(--shadow-soft)]"
            >
              <Bell className="size-5" strokeWidth={1.4} />
              {unreadCount > 0 && (
                <span
                  className={`absolute size-2 rounded-full bg-risk-red ${
                    desktop ? "right-3 top-2" : "right-2.5 top-2"
                  }`}
                />
              )}
            </button>
            {notifOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[12px] bg-surface p-4 text-[14px] shadow-[var(--shadow-soft)] min-[900px]:left-auto min-[900px]:right-0">
                <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                  <span className="text-[13px] font-medium text-ink">Notifications</span>
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={unreadCount === 0}
                    className="rounded-[6px] px-2 py-1 text-[12px] text-ink-soft transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
                  >
                    Mark all as read
                  </button>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {notifications.map((notification) => (
                    <li key={notification.id} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          notification.read ? "bg-border" : "bg-risk-red"
                        }`}
                      />
                      <span
                        className={`leading-[1.45] ${
                          notification.read ? "text-ink-faint" : "text-ink-soft"
                        }`}
                      >
                        {notification.message}
                        <span className="sr-only">
                          {notification.read ? " (read)" : " (unread)"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            onClick={toggleTheme}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            style={desktop ? { width: 48 * K, height: 48 * K } : undefined}
            className={`flex items-center justify-center rounded-[10px] border border-border bg-surface text-ink shadow-[var(--shadow-soft)] ${
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
