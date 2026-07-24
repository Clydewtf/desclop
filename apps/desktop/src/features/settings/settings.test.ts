import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  normalizeCaptureShortcut,
  normalizeSettings,
  readSettings,
  shortcutFromKeyboardEvent,
  shortcutMatchesKeyboardEvent,
  writeSettings
} from "./settings";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values
  };
}

describe("settings", () => {
  it("returns stable defaults when storage is empty", () => {
    expect(readSettings(createStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates a legacy flat object and fills missing fields", () => {
    const storage = createStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({
        theme: "dark",
        compactSidebar: true,
        captureShortcut: "Ctrl+Shift+K",
        unknownFutureField: "ignored"
      })
    });

    expect(readSettings(storage)).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "dark",
      compactSidebar: true,
      captureShortcut: "CommandOrControl+Shift+K"
    });
  });

  it("falls back field by field for malformed or unsupported values", () => {
    expect(
      normalizeSettings({
        schemaVersion: 99,
        settings: {
          theme: "sepia",
          closeBehavior: "broken",
          windowResizable: "yes",
          density: "compact",
          textScale: "huge",
          captureShortcut: "Shift+"
        }
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      density: "compact"
    });
  });

  it("writes a versioned envelope and survives unavailable storage", () => {
    const storage = createStorage();
    expect(writeSettings(storage, { ...DEFAULT_SETTINGS, density: "compact" })).toBe(true);
    expect(JSON.parse(storage.values.get(SETTINGS_STORAGE_KEY)!)).toEqual({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      settings: { ...DEFAULT_SETTINGS, density: "compact" }
    });

    const unavailableStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage unavailable");
      }
    };
    expect(writeSettings(unavailableStorage, DEFAULT_SETTINGS)).toBe(false);
  });

  it("supports a single custom key and a platform-aware combination", () => {
    expect(normalizeCaptureShortcut("F8")).toBe("F8");
    expect(
      shortcutFromKeyboardEvent(
        {
          code: "KeyK",
          ctrlKey: false,
          metaKey: true,
          altKey: false,
          shiftKey: true
        }
      )
    ).toBe("CommandOrControl+Shift+KeyK");

    expect(
      shortcutMatchesKeyboardEvent(
        "CommandOrControl+Shift+K",
        {
          code: "KeyK",
          key: "k",
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: true
        },
        "Win32"
      )
    ).toBe(true);
  });
});
