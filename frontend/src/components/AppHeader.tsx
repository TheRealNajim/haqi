import { useEffect, useState, type ReactNode } from "react";
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

/**
 * The notification bell is hidden on every screen for now. Flip this to true
 * to bring back the bell and its panel; the state and copy stay intact.
 */
const SHOW_NOTIFICATIONS = false;

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
  /** Mobile-only page navigation, shown inside the collapsible menu. */
  mobileNav?: ReactNode;
  /** Current screen; changing it closes the mobile menu. */
  screen?: string;
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
  mobileNav,
  screen,
}: AppHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Navigating away should not leave the mobile menu hanging open.
  useEffect(() => {
    setMenuOpen(false);
  }, [screen]);

  const logo = (
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
  );

  const searchField = (
    <label
      style={desktop ? { width: 560 * K } : undefined}
      className={`flex items-center gap-3 rounded-[10px] border border-border bg-surface px-4 shadow-[var(--shadow-soft)] ${
        desktop ? "" : "h-10 w-full"
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
  );

  const filterFields =
    showFilters &&
    FILTER_KEYS.map((key) => (
      <div
        key={key}
        style={desktop ? { width: FILTER_WIDTHS[key] * K } : undefined}
        className={desktop ? "" : "h-10"}
      >
        <Dropdown
          className="h-full"
          value={filters[key]}
          onChange={(value) => onFilterChange(key, value)}
          options={filterOptions[key]}
          disabled={Boolean(disabledFilters?.[key])}
          small={!desktop}
          active={desktop || menuOpen}
        />
      </div>
    ));

  const themeToggle = (
    <button
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      style={desktop ? { width: 48 * K, height: 48 * K } : undefined}
      className={`flex items-center justify-center rounded-[10px] border border-border bg-surface text-ink shadow-[var(--shadow-soft)] ${
        desktop ? "" : "size-10 shrink-0"
      }`}
    >
      <span aria-hidden="true" className="grid size-5 place-items-center">
        <Sun
          className={`col-start-1 row-start-1 size-5 transition-[rotate,scale,opacity] duration-300 ease-out motion-reduce:transition-none ${
            dark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"
          }`}
          strokeWidth={1.4}
        />
        <Moon
          className={`col-start-1 row-start-1 size-5 transition-[rotate,scale,opacity] duration-300 ease-out motion-reduce:transition-none ${
            dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"
          }`}
          strokeWidth={1.4}
        />
      </span>
    </button>
  );

  const actions = (
    <div
      style={desktop ? { marginLeft: 73 * K } : undefined}
      className="flex shrink-0 items-stretch gap-3"
    >
      {SHOW_NOTIFICATIONS ? (
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
                      <span className="sr-only">{notification.read ? " (read)" : " (unread)"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {desktop ? themeToggle : null}
    </div>
  );

  if (desktop) {
    return (
      <header className="contents">
        {logo}
        <div
          style={{
            position: "absolute",
            left: 389 * K,
            // Vertically centred against the 56-tall logo block.
            top: 35 * K,
            width: 1499 * K,
            height: 48 * K,
          }}
          className="flex flex-wrap items-stretch gap-3.5"
        >
          {searchField}
          {filterFields}
          {actions}
        </div>
      </header>
    );
  }

  return (
    <header className="flex flex-col">
      {/* Theme toggle and hamburger share the logo's line, pinned to the right edge. */}
      <div className="flex items-center justify-between gap-3">
        {logo}
        <div className="flex shrink-0 items-center gap-3">
          {themeToggle}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="haqi-mobile-menu"
            className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-ink shadow-[var(--shadow-soft)] transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            <span aria-hidden="true" className="relative block size-5">
              {[0, 1, 2].map((line) => {
                const closedTransform =
                  line === 0
                    ? "translateY(-50%) translateY(-6px)"
                    : line === 2
                      ? "translateY(-50%) translateY(6px)"
                      : "translateY(-50%)";
                const openTransform =
                  line === 0
                    ? "translateY(-50%) rotate(45deg)"
                    : line === 2
                      ? "translateY(-50%) rotate(-45deg)"
                      : "translateY(-50%) scaleX(0)";
                return (
                  <span
                    key={line}
                    style={{ transform: menuOpen ? openTransform : closedTransform }}
                    className={`absolute left-0 top-1/2 h-[1.5px] w-5 rounded-full bg-current transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
                      menuOpen && line === 1 ? "opacity-0" : "opacity-100"
                    }`}
                  />
                );
              })}
            </span>
          </button>
        </div>
      </div>

      {/*
        Kept mounted so the panel can animate both ways. When closed it is
        collapsed to zero height, hidden from assistive tech and inert, so
        nothing inside it can be focused or tapped.
      */}
      <div
        id="haqi-mobile-menu"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        data-state={menuOpen ? "open" : "closed"}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          menuOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0">
          <div
            className={`mt-4 flex flex-col gap-3.5 rounded-[16px] border border-border bg-canvas px-3 pt-5 pb-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${
              menuOpen ? "translate-y-0" : "-translate-y-2"
            }`}
          >
            {searchField}
            {filterFields ? <div className="grid grid-cols-2 gap-3">{filterFields}</div> : null}
            {mobileNav}
          </div>
        </div>
      </div>
    </header>
  );
}
