import type { AppSettings } from "./settings";

export function applySettingsToDocument(
  settings: AppSettings,
  documentElement: HTMLElement = document.documentElement
) {
  documentElement.dataset.theme = settings.theme;
  documentElement.dataset.density = settings.density;
  documentElement.dataset.sidebar = settings.compactSidebar ? "compact" : "full";
  documentElement.dataset.textScale = settings.textScale;
}
