import { describe, expect, it } from "vitest";
import { getFocusTimerState } from "./focusTimer";

describe("getFocusTimerState", () => {
  it("supports no-limit ambient mode", () => {
    expect(
      getFocusTimerState({
        mode: "ambient",
        startedAtMs: 1000,
        nowMs: 61000,
        timeboxMinutes: null
      })
    ).toEqual({
      elapsedSeconds: 60,
      remainingSeconds: null,
      finished: false
    });
  });

  it("supports timebox mode", () => {
    expect(
      getFocusTimerState({
        mode: "timebox",
        startedAtMs: 1000,
        nowMs: 61000,
        timeboxMinutes: 1
      })
    ).toEqual({
      elapsedSeconds: 60,
      remainingSeconds: 0,
      finished: true
    });
  });
});
