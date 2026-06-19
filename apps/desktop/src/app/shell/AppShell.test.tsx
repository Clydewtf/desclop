import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../styles/base.css";
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
    expect(within(nav).getByText("Work")).toBeInTheDocument();
    expect(within(nav).getByText("Project")).toBeInTheDocument();
    expect(within(nav).queryByRole("heading", { name: "Work" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("heading", { name: "Project" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await user.click(within(nav).getByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(onNavigate).toHaveBeenCalledWith("plan");
    expect(onQuickCapture).toHaveBeenCalledTimes(1);
  });

  it("renders a project action in the Project section and closes the current project", async () => {
    const user = userEvent.setup();
    const onCloseProject = vi.fn();

    render(
      <AppShell
        activeDestination="today"
        projectName="Desclop"
        onCloseProject={onCloseProject}
      >
        <h1>Today</h1>
      </AppShell>
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const projectSection = within(nav).getByRole("region", { name: "Project" });
    const projectAction = within(projectSection).getByRole("button", {
      name: /^(?:switch|close) project$/i
    });

    await user.click(projectAction);

    expect(onCloseProject).toHaveBeenCalledTimes(1);
  });

  it("labels project backups without wrapping export import copy", () => {
    render(
      <AppShell activeDestination="utilities" projectName="Desclop">
        <h1>Backups</h1>
      </AppShell>
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("button", { name: "Backups" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      within(nav).queryByRole("button", { name: "Export / Import" })
    ).not.toBeInTheDocument();
  });

  it("renders switch project as a quieter project action", () => {
    render(
      <AppShell activeDestination="today" projectName="Desclop">
        <h1>Today</h1>
      </AppShell>
    );

    expect(screen.getByRole("button", { name: "Switch project" })).toHaveClass(
      "app-nav__button",
      "app-nav__project-action"
    );
  });

  it("applies compact sidebar button styles after shared button styles", () => {
    render(
      <AppShell activeDestination="today" projectName="Desclop">
        <h1>Today</h1>
      </AppShell>
    );

    const todayStyles = getComputedStyle(screen.getByRole("button", { name: "Today" }));
    expect(todayStyles.minHeight).toBe("36px");
    expect(todayStyles.padding).toBe("7px 10px");
    expect(todayStyles.justifyContent).toBe("flex-start");
    expect(todayStyles.whiteSpace).toBe("nowrap");

    const projectActionStyles = getComputedStyle(
      screen.getByRole("button", { name: "Switch project" })
    );
    expect(projectActionStyles.marginTop).toBe("var(--space-2)");
    expect(projectActionStyles.color).toBe("var(--color-muted)");
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
    expect(screen.queryByText("Project")).not.toBeInTheDocument();
  });
});
