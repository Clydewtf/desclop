import { describe, expect, it } from "vitest";
import { classifyError, formatUserFacingError } from "./safeError";

describe("safe error handling", () => {
  it("classifies local error categories without exposing their details", () => {
    expect(classifyError(new Error("SQLite cannot open /Users/clyde/project"))).toBe("database");
    expect(classifyError(new Error("permission denied for /Users/clyde/project"))).toBe("permission");
    expect(classifyError(new Error("backup file is missing"))).toBe("filesystem");
  });

  it("does not include sensitive implementation details in the user-facing message", () => {
    const message = formatUserFacingError(
      "Settings change",
      new Error("failed at /Users/clyde/private-project with token SECRET_VALUE")
    );

    expect(message).toContain("Settings change could not be completed.");
    expect(message).toContain("Reference: ERR-");
    expect(message).not.toContain("/Users/clyde/private-project");
    expect(message).not.toContain("SECRET_VALUE");
  });
});
