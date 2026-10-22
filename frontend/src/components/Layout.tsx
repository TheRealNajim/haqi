import { Outlet } from "react-router-dom";
import { Nav } from "./Nav";
import { isFixturesMode } from "@/api";

export function Layout() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main">
        {isFixturesMode ? (
          <p className="demo-banner" role="status">
            <strong>Demo fixtures</strong>
            <span>Offline sample data — not live air readings.</span>
          </p>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}
