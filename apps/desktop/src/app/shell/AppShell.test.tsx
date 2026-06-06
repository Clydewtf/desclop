import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders project identity, primary navigation, and quick capture", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onQuickCapture = vi.fn();

    render(
      <AppShell
        activeDestination="today"
        projectName="Desclop"
        projectStatus="Git unavailable"
        onNavigate={onNavigate}
        onQuickCapture={onQuickCapture}
      >
        <h1>Today</h1>
      </AppShell>
    );

    expect(screen.getByText("Desclop")).toBeInTheDocument();
    expect(screen.getByText("Git unavailable")).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("heading", { name: "Work" })).toBeInTheDocument();
    expect(within(nav).getByRole("heading", { name: "Project" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await user.click(within(nav).getByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(onNavigate).toHaveBeenCalledWith("plan");
    expect(onQuickCapture).toHaveBeenCalledTimes(1);
  });

  it("renders setup state without project-only destinations", () => {
    render(
      <AppShell activeDestination="setup">
        <h1>Create project</h1>
      </AppShell>
    );

    expect(screen.getByText("Desclop")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create project" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project" })).not.toBeInTheDocument();
  });
});
