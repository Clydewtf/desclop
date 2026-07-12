import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { FirstRunHelp } from "./FirstRunHelp";

const FIRST_RUN_HELP_STORAGE_KEY = "desclop.first-run-help.dismissed";
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
});

afterEach(() => {
  onboardingStorage.clear();
  window.localStorage.removeItem(FIRST_RUN_HELP_STORAGE_KEY);
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
});
