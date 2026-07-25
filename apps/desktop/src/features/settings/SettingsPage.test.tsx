import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { Settings } from "./SettingsPage";

describe("Settings", () => {
  it("renders persistent appearance, window, and capture controls", () => {
    render(
      <Settings
        settings={DEFAULT_SETTINGS}
        onChange={vi.fn()}
        onQuit={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Theme")).toHaveValue("system");
    expect(screen.getByRole("checkbox", { name: /Show explanatory text/ })).toBeChecked();
    expect(screen.getByLabelText("When the window is closed")).toHaveValue("tray");
    expect(screen.getByRole("button", { name: "Ctrl+Shift+C" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quit Desclop" })).toBeInTheDocument();
  });

  it("toggles explanatory text visibility", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Settings settings={DEFAULT_SETTINGS} onChange={onChange} onQuit={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /Show explanatory text/ }));

    expect(onChange).toHaveBeenCalledWith("showExplanations", false);
  });

  it("orders appearance controls in one compact row", () => {
    render(<Settings settings={DEFAULT_SETTINGS} onChange={vi.fn()} onQuit={vi.fn()} />);

    const appearance = screen.getByRole("article", { name: "Appearance settings" });
    const labels = Array.from(
      appearance.querySelectorAll<HTMLElement>(".ui-field__label, .settings-checkbox__copy strong")
    ).map((label) => label.textContent);

    expect(appearance.querySelector(".settings-form")).toHaveClass("settings-form--appearance");
    expect(labels).toEqual([
      "Theme",
      "Density",
      "Interface size",
      "Compact sidebar",
      "Show explanatory text"
    ]);
  });

  it("records a custom single key and supports cancelling with Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Settings settings={DEFAULT_SETTINGS} onChange={onChange} onQuit={vi.fn()} />);

    const recorder = screen.getByRole("button", { name: "Ctrl+Shift+C" });
    await user.click(recorder);
    expect(recorder).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { code: "F8", key: "F8" });
    expect(onChange).toHaveBeenCalledWith("captureShortcut", "F8");

    await user.click(recorder);
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(recorder).toHaveAttribute("aria-pressed", "false");
  });

  it("shows native shortcut errors without hiding the settings controls", () => {
    render(
      <Settings
        settings={DEFAULT_SETTINGS}
        error="Capture shortcut could not be applied. Shortcut is already in use."
        onChange={vi.fn()}
        onQuit={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("already in use");
    expect(screen.getByRole("button", { name: "Ctrl+Shift+C" })).toBeInTheDocument();
  });
});
