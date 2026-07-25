import type { GitCommit, InboxItem, Note, Task, WorkEntry } from "../../shared/domain/types";
import { describe, expect, it } from "vitest";
import { activityHeatmapLevel, buildWeeklyReview } from "./weeklyReviewEngine";

describe("buildWeeklyReview", () => {
  const timestamp = (
    year: number,
    monthIndex: number,
    day: number,
    hour = 12,
    minute = 0
  ) => new Date(year, monthIndex, day, hour, minute).toISOString();
  const now = new Date(2026, 5, 16, 12);
  const project = { activeTaskId: "active-task" };

  it("counts period metrics with inclusive start and exclusive end boundaries", () => {
    const review = buildWeeklyReview({
      project,
      now,
      tasks: [
        task({ id: "start-task", status: "done", completedAt: timestamp(2026, 5, 10, 0) }),
        task({ id: "inside-task", status: "done", completedAt: timestamp(2026, 5, 16, 9) }),
        task({ id: "before-task", status: "done", completedAt: timestamp(2026, 5, 9, 23, 59) }),
        task({ id: "end-task", status: "done", completedAt: timestamp(2026, 5, 17, 0) }),
        task({ id: "missing-date-task", status: "done", updatedAt: timestamp(2026, 5, 16, 8) }),
        task({ id: "unfinished", status: "todo", nextStep: "   " })
      ],
      inboxItems: [
        inbox({ id: "open-old", status: "open", createdAt: timestamp(2026, 4, 1) }),
        inbox({ id: "attached", status: "attached", createdAt: timestamp(2026, 5, 16) })
      ],
      workEntries: [
        work({ id: "review-inside", createdAt: timestamp(2026, 5, 16, 10) }),
        work({ id: "review-outside", createdAt: timestamp(2026, 5, 9, 10) })
      ],
      notes: [],
      commits: []
    });

    expect(review.completedTasks.map((candidate) => candidate.id)).toEqual([
      "inside-task",
      "start-task"
    ]);
    expect(review.completedTasksExcludedForMissingDate).toBe(1);
    expect(review.openCaptures.map((candidate) => candidate.id)).toEqual(["open-old"]);
    expect(review.tasksWithoutNextAction.map((candidate) => candidate.id)).toEqual(["unfinished"]);
    expect(review.workReviews.map((candidate) => candidate.id)).toEqual(["review-inside"]);
  });

  it("keeps missing next actions and handoff context explicit", () => {
    const review = buildWeeklyReview({
      project,
      now,
      tasks: [
        task({ id: "blocked", title: "Unblock API", status: "blocked", nextStep: "" }),
        task({ id: "missing", title: "Clarify copy", status: "todo", nextStep: "" }),
        task({ id: "ready", title: "Ready task", status: "todo", nextStep: "Ship it" })
      ],
      inboxItems: [
        inbox({ id: "capture-1", body: "Open question" }),
        inbox({ id: "capture-2", body: "Another open question" })
      ],
      workEntries: [
        work({ id: "older-handoff", createdAt: timestamp(2026, 5, 1) }),
        work({ id: "latest-handoff", createdAt: timestamp(2026, 5, 15), remains: "Verify locally" })
      ],
      notes: [],
      commits: [],
      gitStatus: {
        enabled: true,
        unavailable: false,
        syncedAt: timestamp(2026, 5, 16, 11)
      }
    });

    expect(review.tasksWithoutNextAction.map((candidate) => candidate.id)).toEqual([
      "blocked",
      "missing"
    ]);
    expect(review.lastHandoff.latestWorkReview?.id).toBe("latest-handoff");
    expect(review.gitStatus.syncedAt).toBe(timestamp(2026, 5, 16, 11));
  });

  it("deduplicates activity days and records each contributing local source", () => {
    const review = buildWeeklyReview({
      project: { activeTaskId: null },
      now,
      tasks: [task({ id: "completed", status: "done", completedAt: timestamp(2026, 5, 16, 9) })],
      inboxItems: [inbox({ id: "capture", createdAt: timestamp(2026, 5, 16, 10) })],
      workEntries: [work({ id: "work", createdAt: timestamp(2026, 5, 16, 11) })],
      notes: [note({ id: "note", createdAt: timestamp(2026, 5, 15, 11) })],
      commits: [commit({ sha: "commit", committedAt: timestamp(2026, 5, 15, 12) })]
    });

    expect(review.activityDays.map((day) => day.dateKey)).toEqual([
      "2026-06-15",
      "2026-06-16"
    ]);
    expect(review.activityDays.map((day) => day.count)).toEqual([2, 3]);
    expect(review.activityDays[0].sources).toEqual(["note", "commit"]);
    expect(review.activityDays[1].sources).toEqual(["task", "work", "capture"]);
    expect(review.activityDays[1].events.map((event) => event.label)).toEqual([
      "Reviewed work",
      "Capture",
      "Task"
    ]);
    expect(review.activityDays[1].events.map((event) => event.taskId)).toEqual([
      "active-task",
      null,
      "completed"
    ]);
    expect(review.activityGrid).toHaveLength(7);
    expect(review.activityGrid.filter((day) => day.count > 0).map((day) => day.dateKey)).toEqual([
      "2026-06-15",
      "2026-06-16"
    ]);
  });

  it("maps action counts to calm heatmap intensity levels", () => {
    expect([0, 1, 2, 3, 4, 6, 7].map(activityHeatmapLevel)).toEqual([0, 1, 2, 2, 3, 3, 4]);
  });

  it("calculates resume readiness from the active task and a fresh task or project review", () => {
    const ready = buildWeeklyReview({
      project,
      now,
      tasks: [task({ id: "active-task", status: "active", nextStep: "Run focused tests" })],
      inboxItems: [],
      workEntries: [work({ id: "fresh", taskId: null, createdAt: timestamp(2026, 5, 15) })],
      notes: [],
      commits: []
    });

    expect(ready.resumeReadiness).toMatchObject({
      hasActiveTask: true,
      hasNextAction: true,
      hasFreshWorkReview: true,
      ready: true
    });

    const notReady = buildWeeklyReview({
      project,
      now,
      tasks: [task({ id: "active-task", status: "active", nextStep: "" })],
      inboxItems: [],
      workEntries: [],
      notes: [],
      commits: []
    });

    expect(notReady.resumeReadiness).toMatchObject({
      hasActiveTask: true,
      hasNextAction: false,
      hasFreshWorkReview: false,
      ready: false
    });
  });
});

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task",
    projectId: "p1",
    stageId: "s1",
    title: "Task",
    description: "",
    status: "todo",
    priority: null,
    dueDate: null,
    nextStep: "Next action",
    position: 0,
    ...overrides
  };
}

function inbox(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "inbox",
    projectId: "p1",
    taskId: null,
    body: "Capture",
    kind: "note",
    status: "open",
    createdAt: "2026-06-16T10:00:00.000Z",
    updatedAt: "2026-06-16T10:00:00.000Z",
    ...overrides
  };
}

function work(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    id: "work",
    projectId: "p1",
    taskId: "active-task",
    source: "manual",
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    done: "Reviewed work",
    remains: "",
    nextStep: "",
    createdAt: "2026-06-16T10:00:00.000Z",
    ...overrides
  };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note",
    projectId: "p1",
    taskId: null,
    body: "Note",
    createdAt: "2026-06-16T10:00:00.000Z",
    ...overrides
  };
}

function commit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    sha: "sha",
    projectId: "p1",
    branch: "main",
    message: "Commit",
    authorName: "Developer",
    committedAt: "2026-06-16T10:00:00.000Z",
    changedFiles: [],
    ...overrides
  };
}
