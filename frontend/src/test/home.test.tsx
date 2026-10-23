import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "@/App";

describe("Home", () => {
  it("renders the dashboard and its main panels", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "World Risk Map" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Risk Type Distribution" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Top Risk Regions" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Risk Trend (All Assets)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Egypt Operations" })).toBeInTheDocument();
  });
});
