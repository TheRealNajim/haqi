import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "@/App";

/**
 * jsdom renders at 1024px, which is the mobile layout: the search, filters,
 * theme toggle and page nav live around the hamburger menu.
 */
const openMenu = () => {
  const trigger = screen.queryByRole("button", { name: "Open menu" });
  if (trigger) fireEvent.click(trigger);
};

describe("Home", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    localStorage.removeItem("haqi-theme");
    document.documentElement.classList.remove("dark");
  });

  it("renders the dashboard and its main panels", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "World Risk Map" })).toBeInTheDocument();
    openMenu();
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.getByAltText("haqi")).toBeInTheDocument();

    // The original dashboard cards are kept; their content is live.
    expect(
      await screen.findByRole("heading", { name: "Air Quality in Your Area" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top Regions by AQI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where This Comes From" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Lagos, Nigeria" })).toBeInTheDocument();

    // Fixtures mode renders a labelled demo reading, never an unlabelled one.
    expect((await screen.findAllByText("82")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Demo data, not live/)).toBeInTheDocument();
  });

  it("prefills the filters from location detection and cascades changes", async () => {
    render(<App />);
    openMenu();

    // Detection pre-fills region, country and area in fixtures mode.
    expect(await screen.findByRole("button", { name: "Lagos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nigeria" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Africa" })).toBeInTheDocument();

    // Changing the region clears its children.
    fireEvent.click(screen.getByRole("button", { name: "Africa" }));
    fireEvent.click(screen.getByRole("button", { name: "Asia" }));
    expect(screen.getByRole("button", { name: "Select Country" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select country first" })).toBeInTheDocument();
    expect(await screen.findByText(/A whole region has no single air reading/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select Country" }));
    fireEvent.click(screen.getByRole("button", { name: "India" }));
    expect(screen.getByRole("button", { name: "Select Area" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select Area" }));
    fireEvent.click(screen.getByRole("button", { name: "Delhi" }));
    expect(screen.getByRole("button", { name: "Delhi" })).toBeInTheDocument();
  });

  it("switches between light and dark themes", () => {
    localStorage.removeItem("haqi-theme");
    document.documentElement.classList.remove("dark");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("navigates to /ask and shows four non-interactive capability cards", () => {
    render(<App />);
    openMenu();
    fireEvent.click(screen.getByRole("link", { name: "Ask" }));

    expect(window.location.pathname).toBe("/ask");
    expect(screen.getByRole("heading", { level: 1, name: "Ask HAQI" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Analyze Data" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask Questions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Understand Why" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Find Sources" })).toBeInTheDocument();

    // The cards are informational: no tab buttons, but every prompt is visible.
    expect(screen.queryByRole("button", { name: /Analyze Data/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ask Questions/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Compare air quality across three Nigerian cities\./ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /What does today's AQI mean\?/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Where does this AQI reading come from\?/ }),
    ).toBeInTheDocument();

    const composer = screen.getByPlaceholderText("Ask HAQI about the air around you...");
    const send = screen.getByRole("button", { name: "Send question" });
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /What does today's AQI mean\?/ }));
    expect(composer).toHaveValue("What does today's AQI mean?");
    expect(send).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: /Where does this AQI reading come from\?/ }),
    );
    expect(composer).toHaveValue("Where does this AQI reading come from?");

    fireEvent.change(composer, { target: { value: "   " } });
    expect(send).toBeDisabled();
  });

  it("answers a question with a fixture response and supports follow-ups", async () => {
    render(<App />);
    openMenu();
    fireEvent.click(screen.getByRole("link", { name: "Ask" }));

    fireEvent.change(screen.getByPlaceholderText("Ask HAQI about the air around you..."), {
      target: { value: "What does today's AQI mean?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    expect(await screen.findByText("HAQI is reading the demo fixtures…")).toBeInTheDocument();
    expect(
      await screen.findByRole(
        "heading",
        { name: "What today's AQI of 82 means" },
        { timeout: 2500 },
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("You asked")).toBeInTheDocument();
    expect(screen.getAllByText(/Demo data/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demo fixture · not live data/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Keep exploring" })).toBeInTheDocument();
    expect(screen.queryByLabelText("HAQI capabilities")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /How does poor air quality affect people with asthma\?/,
      }),
    );
    expect(screen.getByPlaceholderText("Ask HAQI about the air around you...")).toHaveValue(
      "How does poor air quality affect people with asthma?",
    );

    fireEvent.click(screen.getByRole("button", { name: "New question" }));
    expect(
      screen.queryByRole("heading", { name: "What today's AQI of 82 means" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Ask HAQI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Find Sources" })).toBeInTheDocument();
  });

  it("restores the Ask question, answer and draft after immersive map mode", async () => {
    render(<App />);
    openMenu();
    fireEvent.click(screen.getByRole("link", { name: "Ask" }));

    const composer = screen.getByPlaceholderText("Ask HAQI about the air around you...");
    fireEvent.change(composer, {
      target: { value: "Why might air quality be poor in this area?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    expect(
      await screen.findByRole(
        "heading",
        { name: "Why air quality may be poor here" },
        { timeout: 2500 },
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask HAQI about the air around you..."), {
      target: { value: "Draft follow-up" },
    });
    fireEvent.click(screen.getByRole("button", { name: "View Full Map" }));

    expect(screen.getByRole("dialog", { name: "Full air-quality map" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exit full map" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Full air-quality map" }),
      ).not.toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe("/ask");
    expect(screen.getByRole("heading", { level: 1, name: "Ask HAQI" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Why air quality may be poor here" }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask HAQI about the air around you...")).toHaveValue(
      "Draft follow-up",
    );
  });

  it("opens /why and asks for a question before showing an evidence chain", () => {
    localStorage.removeItem("haqi:last-live-ledger");
    render(<App />);
    openMenu();
    fireEvent.click(screen.getByRole("link", { name: "Why" }));

    expect(window.location.pathname).toBe("/why");
    expect(screen.getByRole("heading", { level: 1, name: "Why?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evidence chain" })).toBeInTheDocument();
    expect(
      screen.getAllByText("Ask a question to see its live evidence chain.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Blind spots" })).toBeInTheDocument();
  });

  it("keeps the mobile search, filters and nav inside the hamburger menu", async () => {
    render(<App />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!);
    expect(panel).not.toBeNull();

    // Closed by default: collapsed, hidden from assistive tech and inert.
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");

    // The theme toggle stays outside the menu, next to the hamburger.
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(panel).not.toContainElement(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );

    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(panel).toHaveAttribute("data-state", "open");
    expect(panel).toHaveAttribute("aria-hidden", "false");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Africa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Risk Type" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));

    // The panel stays mounted for its closing animation but is inert again.
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("closes the mobile menu after navigating", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("link", { name: "Ask" }));

    expect(window.location.pathname).toBe("/ask");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("renders the Ask page directly from its slug", () => {
    window.history.replaceState(null, "", "/ask");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Ask HAQI" })).toBeInTheDocument();
    openMenu();
    expect(screen.getByRole("link", { name: "Ask" })).toHaveAttribute("aria-current", "page");
  });
});
