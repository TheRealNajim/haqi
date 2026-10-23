import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "@/App";

describe("Home", () => {
  it("renders the dashboard and its main panels", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "World Risk Map" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Region" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(screen.getByAltText("haqi")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Risk Type Distribution" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Top Risk Regions" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Risk Trend (All Assets)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Egypt Operations" })).toBeInTheDocument();
  });

  it("cascades the region, country and area filters", () => {
    render(<App />);

    // Dependent filters stay locked until their parent is chosen.
    expect(screen.getByRole("button", { name: "Select region first" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select country first" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select Region" }));
    fireEvent.click(screen.getByRole("button", { name: "Africa" }));
    expect(screen.getByRole("button", { name: "Select Country" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select Country" }));
    fireEvent.click(screen.getByRole("button", { name: "Nigeria" }));
    expect(screen.getByRole("button", { name: "Select Area" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select Area" }));
    fireEvent.click(screen.getByRole("button", { name: "Lagos" }));
    expect(screen.getByRole("button", { name: "Lagos" })).toBeInTheDocument();
  });

  it("switches between light and dark themes", () => {
    localStorage.removeItem("haqi-theme");
    document.documentElement.classList.remove("dark");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
