import { describe, expect, it } from "vitest";
import { canUseLocalCore } from "./licenseBoundary";

describe("canUseLocalCore", () => {
  it("keeps local project data usable for beta, founder, and trial states", () => {
    expect(canUseLocalCore({ licenseState: "free_beta" })).toBe(true);
    expect(canUseLocalCore({ licenseState: "founder" })).toBe(true);
    expect(canUseLocalCore({ licenseState: "trial" })).toBe(true);
    expect(canUseLocalCore({ licenseState: "expired" })).toBe(false);
  });
});
