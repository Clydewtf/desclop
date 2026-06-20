import { describe, expect, it } from "vitest";
import { formatTimelineDateLabel, formatTimelineTime } from "./displayTime";

describe("displayTime", () => {
  const timestamp = (year: number, monthIndex: number, day: number, hour: number, minute: number) =>
    new Date(year, monthIndex, day, hour, minute).toISOString();
  const now = new Date(2026, 5, 16, 12);

  it("formats today and yesterday labels", () => {
    expect(formatTimelineDateLabel(timestamp(2026, 5, 16, 8, 51), now)).toBe("Today, Jun 16");
    expect(formatTimelineDateLabel(timestamp(2026, 5, 15, 18, 25), now)).toBe("Yesterday, Jun 15");
  });

  it("formats yesterday across a daylight saving transition", () => {
    const afterSpringForward = new Date(2026, 2, 9, 12);

    expect(formatTimelineDateLabel(timestamp(2026, 2, 8, 12, 0), afterSpringForward)).toBe("Yesterday, Mar 8");
  });

  it("formats older date labels with year", () => {
    expect(formatTimelineDateLabel(timestamp(2026, 5, 9, 13, 57), now)).toBe("Jun 9, 2026");
  });

  it("formats local hour and minute without raw ISO text", () => {
    expect(formatTimelineTime(timestamp(2026, 5, 16, 8, 51))).toBe("08:51");
  });

  it("handles invalid timestamps", () => {
    expect(formatTimelineDateLabel("not-a-date", now)).toBe("Undated");
    expect(formatTimelineTime("not-a-date")).toBe("");
  });
});
