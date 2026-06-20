import { describe, expect, it } from "vitest";
import { formatTimelineDateLabel, formatTimelineTime } from "./displayTime";

describe("displayTime", () => {
  const now = new Date("2026-06-16T12:00:00Z");

  it("formats today and yesterday labels", () => {
    expect(formatTimelineDateLabel("2026-06-16T08:51:07Z", now)).toBe("Today, Jun 16");
    expect(formatTimelineDateLabel("2026-06-15T18:25:00Z", now)).toBe("Yesterday, Jun 15");
  });

  it("formats older date labels with year", () => {
    expect(formatTimelineDateLabel("2026-06-09T13:57:00Z", now)).toBe("Jun 9, 2026");
  });

  it("formats local hour and minute without raw ISO text", () => {
    expect(formatTimelineTime("2026-06-16T08:51:07Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});
