import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Today } from "./Today";

describe("Today", () => {
  it("shows resume-first content and continue action", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    renderWithRouter(
      <Today
        view={{
          heading: "Continue where you left off",
          primaryTaskTitle: "Create local store",
          stageTitle: "Foundation",
          latestNote: "Migration passes",
          nextStep: "Run repository tests",
          facts: ["1 recent commit on main"],
          nextTasks: []
        }}
        onContinue={onContinue}
      />
    );

    expect(screen.getByText("Continue where you left off")).toBeInTheDocument();
    expect(screen.getByText("Create local store")).toBeInTheDocument();
    expect(screen.getByText("Run repository tests")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue task" }));
    expect(onContinue).toHaveBeenCalled();
  });
});
