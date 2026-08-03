import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("blocks the browser context menu inside the application shell", () => {
    render(
      <AppShell activeDestination="today" projectName="Desclop">
        <h1>Today</h1>
      </AppShell>
    );

    const heading = screen.getByRole("heading", { name: "Today" });
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    heading.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
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

    const footer = document.querySelector<HTMLElement>(".app-sidebar__footer");
    expect(footer).not.toBeNull();
    const projectAction = within(footer as HTMLElement).getByRole("button", {
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
      <AppShell
        activeDestination="today"
        projectName="Desclop"
        onCloseProject={vi.fn()}
      >
        <h1>Today</h1>
      </AppShell>
    );

    const footer = document.querySelector<HTMLElement>(".app-sidebar__footer");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByRole("button", { name: "Switch project" })).toHaveClass(
      "app-nav__button",
      "app-nav__project-action"
    );
  });

  it("applies compact sidebar button styles after shared button styles", () => {
    render(
      <AppShell
        activeDestination="today"
        projectName="Desclop"
        onCloseProject={vi.fn()}
      >
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

  it("keeps the sidebar fixed while application content scrolls", () => {
    render(
      <AppShell activeDestination="today" projectName="Desclop">
        <div style={{ height: "1800px" }}>Long plan content</div>
      </AppShell>
    );

    const shellStyles = getComputedStyle(document.querySelector(".app-shell") as HTMLElement);
    const sidebarStyles = getComputedStyle(screen.getByLabelText("Application"));
    const contentStyles = getComputedStyle(document.querySelector(".app-content") as HTMLElement);

    expect(shellStyles.height).toBe("100%");
    expect(shellStyles.overflow).toBe("hidden");
    expect(sidebarStyles.overflowY).toBe("auto");
    expect(contentStyles.overflowY).toBe("auto");
  });

  it("renders setup state without project-only destinations", () => {
    const onBackToProjects = vi.fn();

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

  it("renders a global Settings destination when navigation is available", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppShell activeDestination="today" onNavigate={onNavigate}>
        <h1>Today</h1>
      </AppShell>
    );

    const settingsNav = screen.getByRole("navigation", { name: "Application settings" });
    await user.click(within(settingsNav).getByRole("button", { name: "Settings" }));

    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("keeps Settings and Help as icon-only utility actions", () => {
    render(
      <AppShell
        activeDestination="setup"
        onNavigate={vi.fn()}
        onOpenHelp={vi.fn()}
      >
        <h1>Choose a project</h1>
      </AppShell>
    );

    const footer = document.querySelector<HTMLElement>(".app-sidebar__footer");
    expect(footer).not.toBeNull();
    const utilityFooter = footer as HTMLElement;
    const settingsButton = within(utilityFooter).getByRole("button", { name: "Settings" });
    const helpButton = within(utilityFooter).getByRole("button", {
      name: "Help & plan example"
    });
    expect(settingsButton).toHaveClass("app-sidebar__icon-button");
    expect(helpButton).toHaveClass("app-sidebar__icon-button");
    expect(settingsButton).toHaveClass("ui-icon-button--ghost");
    expect(helpButton).toHaveClass("ui-icon-button--ghost");
    expect(getComputedStyle(settingsButton).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(helpButton).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(settingsButton).width).toBe("var(--control-size-compact)");
    expect(getComputedStyle(helpButton).width).toBe("var(--control-size-compact)");
    expect(getComputedStyle(document.documentElement).getPropertyValue("--control-size-compact")).toBe(
      "36px"
    );
    expect(utilityFooter.querySelectorAll(".app-sidebar__icon-button")).toHaveLength(2);
  });

  it("keeps an independent scroll position for each destination", () => {
    const { rerender } = render(
      <AppShell activeDestination="today">
        <div style={{ minHeight: "2400px" }}>Today content</div>
      </AppShell>
    );

    const content = document.querySelector<HTMLElement>(".app-content")!;
    content.scrollTop = 240;
    fireEvent.scroll(content);

    rerender(
      <AppShell activeDestination="plan">
        <div style={{ minHeight: "2400px" }}>Plan content</div>
      </AppShell>
    );
    expect(content.scrollTop).toBe(0);

    content.scrollTop = 480;
    fireEvent.scroll(content);

    rerender(
      <AppShell activeDestination="today">
        <div style={{ minHeight: "2400px" }}>Today content</div>
      </AppShell>
    );
    expect(content.scrollTop).toBe(240);

    rerender(
      <AppShell activeDestination="plan">
        <div style={{ minHeight: "2400px" }}>Plan content</div>
      </AppShell>
    );
    expect(content.scrollTop).toBe(480);
  });

  it("renders a back action for project creation setup", async () => {
    const user = userEvent.setup();
    const onBackToProjects = vi.fn();

    render(
      <AppShell
        activeDestination="setup"
        onBackToProjects={onBackToProjects}
      >
        <h1>Create project</h1>
      </AppShell>
    );

    await user.click(screen.getByRole("button", { name: "Back to projects" }));

    expect(onBackToProjects).toHaveBeenCalledTimes(1);
  });
});
