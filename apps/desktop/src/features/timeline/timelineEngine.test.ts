import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timelineEngine";

describe("buildTimeline", () => {
  const timestamp = (year: number, monthIndex: number, day: number, hour: number, minute: number) =>
    new Date(year, monthIndex, day, hour, minute).toISOString();

  it("groups timeline events by local day with readable labels and separated metadata", () => {
    const now = new Date(2026, 5, 16, 12);
    const timeline = buildTimeline(
      {
        workEntries: [
          {
            id: "w1",
            projectId: "p1",
            taskId: "t1",
            source: "manual",
            startedAt: null,
            endedAt: null,
            durationSeconds: 754,
            done: "Reviewed timeline hierarchy",
            remains: "",
            nextStep: "",
            createdAt: timestamp(2026, 5, 16, 9, 30)
          }
        ],
        commits: [
          {
            sha: "abcdef1234567890",
            projectId: "p1",
            branch: "main",
            message: "fix: timeline grouping",
            authorName: "Clyde",
            committedAt: timestamp(2026, 5, 16, 10, 45),
            changedFiles: ["timelineEngine.ts"]
          }
        ],
        notes: [
          {
            id: "n1",
            projectId: "p1",
            taskId: null,
            body: "Check yesterday grouping\nKeep metadata separate",
            createdAt: timestamp(2026, 5, 15, 16, 20)
          }
        ],
        inboxItems: [],
        completedTasks: []
      },
      now
    );

    expect(timeline.summary).toBe("1 commit · 1 work review · 1 note");
    expect(timeline.sections.map((section) => section.label)).toEqual([
      "Today, Jun 16",
      "Yesterday, Jun 15"
    ]);
    expect(timeline.sections[0].items.map((item) => item.typeLabel)).toEqual(["Commit", "Work review"]);
    expect(timeline.sections[0].items[0]).toMatchObject({
      title: "fix: timeline grouping",
      metadata: "abcdef1 · main · 1 file changed"
    });
    expect(timeline.sections[0].items[0].time).toMatch(/^\d{2}:\d{2}$/);
    expect(timeline.sections[0].items[1]).toMatchObject({
      title: "Reviewed timeline hierarchy",
      metadata: "Manual review · 13 min"
    });
    expect(timeline.sections[1].items[0]).toMatchObject({
      typeLabel: "Note",
      title: "Check yesterday grouping",
      metadata: "Project note"
    });
  });

  it("returns sparse state copy when only commits exist", () => {
    const timeline = buildTimeline({
      workEntries: [],
      commits: [
        {
          sha: "abcdef1234567890",
          projectId: "p1",
          branch: "main",
          message: "chore: initialize history",
          authorName: "Clyde",
          committedAt: timestamp(2026, 5, 16, 10, 45),
          changedFiles: []
        }
      ],
      notes: [],
      inboxItems: [],
      completedTasks: []
    });

    expect(timeline.sparseState).toEqual({
      title: "Only commits so far",
      body: "Work reviews, notes, and captures will appear here as you use Desclop."
    });
  });
});
