export const SETTINGS_STORAGE_KEY = "desclop.settings";
export const SETTINGS_SCHEMA_VERSION = 1;

export type ThemeSetting = "system" | "light" | "dark";
export type CloseBehavior = "tray" | "quit";
export type DensitySetting = "comfortable" | "compact";
export type TextScaleSetting = "small" | "normal" | "large";

export interface AppSettings {
  theme: ThemeSetting;
  closeBehavior: CloseBehavior;
  windowResizable: boolean;
  density: DensitySetting;
  compactSidebar: boolean;
  textScale: TextScaleSetting;
  captureShortcut: string;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  closeBehavior: "tray",
  windowResizable: true,
  density: "comfortable",
  compactSidebar: false,
  textScale: "normal",
  captureShortcut: "CommandOrControl+Shift+C"
};

const modifierAliases: Record<string, string> = {
  alt: "Alt",
  cmd: "CommandOrControl",
  command: "CommandOrControl",
  commandorcontrol: "CommandOrControl",
  commandorctrl: "CommandOrControl",
  control: "CommandOrControl",
  ctrl: "CommandOrControl",
  meta: "CommandOrControl",
  option: "Alt",
  shift: "Shift"
};

const keyAliases: Record<string, string> = {
  esc: "Escape",
  spacebar: "Space"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeShortcutToken(token: string) {
  const trimmed = token.trim();
  const alias = modifierAliases[trimmed.toLowerCase()] ?? keyAliases[trimmed.toLowerCase()];
  if (alias) {
    return alias;
  }

  if (/^key[a-z]$/i.test(trimmed)) {
    return `Key${trimmed.slice(-1).toUpperCase()}`;
  }
  if (/^digit[0-9]$/i.test(trimmed)) {
    return `Digit${trimmed.slice(-1)}`;
  }
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed;
}

export function normalizeCaptureShortcut(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const tokens = value
    .split("+")
    .map(normalizeShortcutToken)
    .filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const mainKey = tokens.at(-1);
  const allowedModifiers = new Set(["CommandOrControl", "Shift", "Alt"]);
  if (!mainKey || allowedModifiers.has(mainKey)) {
    return null;
  }

  const modifiers = tokens.slice(0, -1);
  if (modifiers.some((modifier) => !allowedModifiers.has(modifier))) {
    return null;
  }
  if (new Set(modifiers).size !== modifiers.length) {
    return null;
  }

  return [...modifiers, mainKey].join("+");
}

function readValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function readSettingsRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  if (isRecord(value.settings)) {
    return value.settings;
  }

  return value;
}

export function normalizeSettings(value: unknown): AppSettings {
  const stored = readSettingsRecord(value);
  const captureShortcut = normalizeCaptureShortcut(stored.captureShortcut);

  return {
    theme: readValue(stored.theme, ["system", "light", "dark"], DEFAULT_SETTINGS.theme),
    closeBehavior: readValue(stored.closeBehavior, ["tray", "quit"], DEFAULT_SETTINGS.closeBehavior),
    windowResizable:
      typeof stored.windowResizable === "boolean"
        ? stored.windowResizable
        : DEFAULT_SETTINGS.windowResizable,
    density: readValue(
      stored.density,
      ["comfortable", "compact"],
      DEFAULT_SETTINGS.density
    ),
    compactSidebar:
      typeof stored.compactSidebar === "boolean"
        ? stored.compactSidebar
        : DEFAULT_SETTINGS.compactSidebar,
    textScale: readValue(
      stored.textScale,
      ["small", "normal", "large"],
      DEFAULT_SETTINGS.textScale
    ),
    captureShortcut: captureShortcut ?? DEFAULT_SETTINGS.captureShortcut
  };
}

export function readSettings(storage: SettingsStorage): AppSettings {
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(storage: SettingsStorage, settings: AppSettings): boolean {
  try {
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        settings: normalizeSettings(settings)
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function getInitialSettings(): AppSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    return window.localStorage ? readSettings(window.localStorage) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function isMacPlatform(platform = typeof navigator === "undefined" ? "" : navigator.platform) {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function shortcutMatchesKeyboardEvent(
  shortcut: string,
  event: Pick<KeyboardEvent, "code" | "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  platform?: string
) {
  const normalized = normalizeCaptureShortcut(shortcut);
  if (!normalized) {
    return false;
  }

  const tokens = normalized.split("+");
  const mainKey = tokens.at(-1);
  if (!mainKey) {
    return false;
  }

  const wantsCommandOrControl = tokens.includes("CommandOrControl");
  const wantsAlt = tokens.includes("Alt");
  const wantsShift = tokens.includes("Shift");

  if (wantsCommandOrControl) {
    if (!event.ctrlKey && !event.metaKey) {
      return false;
    }
  } else if (event.ctrlKey || event.metaKey) {
    return false;
  }

  if (event.altKey !== wantsAlt || event.shiftKey !== wantsShift) {
    return false;
  }

  const normalizedEventCode = event.code.toLowerCase();
  const normalizedEventKey = event.key.toLowerCase();
  return (
    normalizedEventCode === mainKey.toLowerCase() ||
    normalizedEventKey === mainKey.toLowerCase()
  );
}

export function shortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">
) {
  const code = event.code.trim();
  if (!code || /^(?:Alt|Control|Meta|Shift)(?:Left|Right)?$/i.test(code)) {
    return null;
  }

  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) {
    modifiers.push("CommandOrControl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }

  return normalizeCaptureShortcut([...modifiers, code].join("+"));
}

export function formatShortcut(shortcut: string, platform?: string) {
  const normalized = normalizeCaptureShortcut(shortcut);
  if (!normalized) {
    return shortcut;
  }

  return normalized
    .split("+")
    .map((token) => {
      if (token === "CommandOrControl") {
        return isMacPlatform(platform) ? "⌘" : "Ctrl";
      }
      if (token === "Shift") {
        return "Shift";
      }
      if (token === "Alt") {
        return isMacPlatform(platform) ? "⌥" : "Alt";
      }
      if (/^Key[A-Z]$/.test(token)) {
        return token.slice(-1);
      }
      if (/^Digit[0-9]$/.test(token)) {
        return token.slice(-1);
      }
      if (token === "Space") {
        return "Space";
      }
      return token;
    })
    .join("+");
}
