import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { FirstRunHint } from "./FirstRunHint";
import { FirstRunHelp } from "./FirstRunHelp";

const FIRST_RUN_HELP_STORAGE_KEY = "desclop.first-run-help.dismissed";
const PROJECT_SETUP_HINT_STORAGE_KEY = "desclop.first-run-help.project-setup.dismissed";
const onboardingStorage = new Map<string, string>();

const onboardingStorageMock = {
  getItem: (key: string) => onboardingStorage.get(key) ?? null,
  setItem: (key: string, value: string) => onboardingStorage.set(key, value),
  removeItem: (key: string) => onboardingStorage.delete(key)
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: onboardingStorageMock
  });
  onboardingStorage.clear();
  window.localStorage.removeItem(FIRST_RUN_HELP_STORAGE_KEY);
  window.localStorage.removeItem(PROJECT_SETUP_HINT_STORAGE_KEY);
});

afterEach(() => {
  onboardingStorage.clear();
  window.localStorage.removeItem(FIRST_RUN_HELP_STORAGE_KEY);
  window.localStorage.removeItem(PROJECT_SETUP_HINT_STORAGE_KEY);
});

describe("FirstRunHelp", () => {
  it("renders an accessible dialog with the four first-run help areas", () => {
    renderWithRouter(<FirstRunHelp />);

    const dialog = screen.getByRole("dialog", { name: "First-run help" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("heading", { name: "Welcome to Desclop" })).toBeInTheDocument();
    expect(within(dialog).getByRole("article", { name: "Today" })).toBeInTheDocument();
    expect(within(dialog).getByRole("article", { name: "Plan" })).toBeInTheDocument();
    expect(within(dialog).getByRole("article", { name: "Timeline" })).toBeInTheDocument();
    expect(within(dialog).getByRole("article", { name: "Capture" })).toBeInTheDocument();
    expect(within(dialog).getByText("Plan example")).toBeInTheDocument();
    expect(within(dialog).getByText(/## Этап 1 — Основа/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("moves initial focus to the dialog action", () => {
    renderWithRouter(<FirstRunHelp />);

    const dialog = screen.getByRole("dialog", { name: "First-run help" });

    expect(within(dialog).getByRole("button", { name: "Got it" })).toHaveFocus();
  });

  it("traps forward and backward Tab focus within the dialog", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <>
        <button type="button">Background action</button>
        <FirstRunHelp />
      </>
    );

    const dialog = screen.getByRole("dialog", { name: "First-run help" });
    const dismissButton = within(dialog).getByRole("button", { name: "Got it" });
    const backgroundAction = screen.getByRole("button", { name: "Background action" });

    dismissButton.focus();
    await user.tab();
    expect(dismissButton).toHaveFocus();
    expect(backgroundAction).not.toHaveFocus();

    await user.tab({ shift: true });
    expect(dismissButton).toHaveFocus();
    expect(backgroundAction).not.toHaveFocus();
  });

  it("dismisses when Escape is pressed", async () => {
    const user = userEvent.setup();

    renderWithRouter(<FirstRunHelp />);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "First-run help" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(FIRST_RUN_HELP_STORAGE_KEY)).toBe("dismissed");
  });

  it("dismisses immediately and stays dismissed on a later mount", async () => {
    const user = userEvent.setup();

    const { unmount } = renderWithRouter(<FirstRunHelp />);
    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.queryByRole("dialog", { name: "First-run help" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(FIRST_RUN_HELP_STORAGE_KEY)).toBe("dismissed");

    unmount();
    renderWithRouter(<FirstRunHelp />);

    expect(screen.queryByRole("dialog", { name: "First-run help" })).not.toBeInTheDocument();
  });

  it("can be reopened after dismissal and can continue to plan import", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onOpenPlanImport = vi.fn();

    const view = renderWithRouter(
      <FirstRunHelp
        onOpenChange={onOpenChange}
        onOpenPlanImport={onOpenPlanImport}
      />
    );

    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog", { name: "First-run help" })).not.toBeInTheDocument();

    view.rerender(
      <FirstRunHelp
        open
        onOpenChange={onOpenChange}
        onOpenPlanImport={onOpenPlanImport}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "First-run help" });
    expect(within(dialog).getByRole("button", { name: "Got it" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Open Import Plan" }));

    expect(onOpenPlanImport).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps a dismissed contextual hint out of later mounts", async () => {
    const user = userEvent.setup();
    const onOpenHelp = vi.fn();

    const view = renderWithRouter(
      <FirstRunHint
        storageKey={PROJECT_SETUP_HINT_STORAGE_KEY}
        title="Your first project"
        onOpenHelp={onOpenHelp}
      >
        <p>Choose a folder.</p>
      </FirstRunHint>
    );

    await user.click(screen.getByRole("button", { name: "Help & plan example" }));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("complementary", { name: "Your first project" })).not.toBeInTheDocument();

    view.rerender(
      <FirstRunHint storageKey={PROJECT_SETUP_HINT_STORAGE_KEY} title="Your first project">
        <p>Choose a folder.</p>
      </FirstRunHint>
    );

    expect(screen.queryByRole("complementary", { name: "Your first project" })).not.toBeInTheDocument();
  });
});
