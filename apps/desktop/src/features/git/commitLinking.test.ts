import { describe, expect, it } from "vitest";
import { chooseCommitLinkMode } from "./commitLinking";

describe("chooseCommitLinkMode", () => {
  it("uses focus interval before active task fallback", () => {
    expect(
      chooseCommitLinkMode({
        committedAt: "2026-05-20T10:10:00Z",
        focusInterval: { startedAt: "2026-05-20T10:00:00Z", endedAt: "2026-05-20T10:30:00Z" },
        activeTaskId: "t1"
      })
    ).toEqual({ taskId: "t1", linkMode: "focus_interval" });
  });

  it("uses active task when no focus interval matches", () => {
    expect(
      chooseCommitLinkMode({
        committedAt: "2026-05-20T11:00:00Z",
        focusInterval: null,
        activeTaskId: "t1"
      })
    ).toEqual({ taskId: "t1", linkMode: "active_task" });
  });

  it("uses the focus task when it differs from the active task", () => {
    expect(
      chooseCommitLinkMode({
        committedAt: "2026-05-20T10:30:00Z",
        focusInterval: {
          taskId: "focus-task",
          startedAt: "2026-05-20T10:00:00Z",
          endedAt: "2026-05-20T10:30:00Z"
        },
        activeTaskId: "active-task"
      })
    ).toEqual({ taskId: "focus-task", linkMode: "focus_interval" });
  });

  it("matches inclusive focus interval boundaries", () => {
    expect(
      chooseCommitLinkMode({
        committedAt: "2026-05-20T10:00:00Z",
        focusInterval: {
          taskId: "focus-task",
          startedAt: "2026-05-20T10:00:00Z",
          endedAt: "2026-05-20T10:30:00Z"
        },
        activeTaskId: null
      })
    ).toEqual({ taskId: "focus-task", linkMode: "focus_interval" });
  });
});
