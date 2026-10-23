import { useCallback, useEffect, useState } from "react";

export type Screen = "today" | "ask" | "why";

export const SCREEN_PATHS: Record<Screen, string> = {
  today: "/today",
  ask: "/ask",
  why: "/why",
};

const SCREEN_TITLES: Record<Screen, string> = {
  today: "World Risk Map — HAQI",
  ask: "Ask HAQI — HAQI",
  why: "Why? — HAQI",
};

export function screenFromPath(pathname: string): Screen {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/ask") return "ask";
  if (path === "/why") return "why";
  return "today";
}

export function titleForScreen(screen: Screen): string {
  return SCREEN_TITLES[screen];
}

/**
 * Minimal history-based router. The app is a three-screen SPA, so a routing
 * dependency would add more surface than it removes.
 */
export function useRoute() {
  const [screen, setScreen] = useState<Screen>(() => screenFromPath(window.location.pathname));

  useEffect(() => {
    const sync = () => setScreen(screenFromPath(window.location.pathname));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    document.title = titleForScreen(screen);
  }, [screen]);

  const navigate = useCallback((next: Screen, options?: { replace?: boolean }) => {
    const path = SCREEN_PATHS[next];
    if (window.location.pathname !== path) {
      window.history[options?.replace ? "replaceState" : "pushState"](null, "", path);
    }
    setScreen(next);
    // jsdom has no layout, so scrollTo is not implemented there.
    if (typeof window.scrollTo === "function") {
      try {
        window.scrollTo(0, 0);
      } catch {
        // Ignore environments without scroll support.
      }
    }
  }, []);

  return { screen, navigate };
}
