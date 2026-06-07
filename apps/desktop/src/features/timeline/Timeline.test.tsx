import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it("renders a readable review screen from available resume facts", () => {
    renderWithRouter(
      <Timeline
        facts={["1 recent commit on main", "2 recent work entries"]}
        gitUnavailable={false}
        resumeUnavailable={false}
      />
    );

    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("1 recent commit on main")).toBeInTheDocument();
    expect(screen.getByText("2 recent work entries")).toBeInTheDocument();
  });

  it("renders an actionable empty state", () => {
    renderWithRouter(<Timeline facts={[]} gitUnavailable={true} resumeUnavailable={false} />);

    expect(screen.getByRole("heading", { name: "No timeline facts yet" })).toBeInTheDocument();
    expect(
      screen.getByText("Capture notes or save a work review to build project memory.")
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Git unavailable.");
  });
});
