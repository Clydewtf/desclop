import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { applySettingsToDocument } from "./settingsPresentation";

describe("applySettingsToDocument", () => {
  it("applies presentation and explanation visibility attributes", () => {
    const root = document.createElement("html");

    applySettingsToDocument(
      {
        ...DEFAULT_SETTINGS,
        theme: "dark",
        density: "compact",
        compactSidebar: true,
        textScale: "large",
        showExplanations: false
      },
      root
    );

    expect(root.dataset).toMatchObject({
      theme: "dark",
      density: "compact",
      sidebar: "compact",
      textScale: "large",
      showExplanations: "false"
    });
  });
});
