import { describe, expect, it } from "vitest";
import type { Stage, Task } from "../../shared/domain/types";
import { buildResumeBriefView } from "./resumeEngine";

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    projectId: "p1",
    stageId: "s1",
    title: "Create local store",
    description: "",
    status: "active",
    priority: null,
    dueDate: null,
    nextStep: "Run repository tests",
    position: 0,
    ...overrides
  };
}

function stageFixture(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "s1",
    projectId: "p1",
    title: "Foundation",
    description: "",
    position: 0,
    status: "current",
    ...overrides
  };
}

describe("buildResumeBriefView", () => {
  it("prioritizes active task, latest note, recent commits, and next step", () => {
    const view = buildResumeBriefView({
      task: taskFixture(),
      stage: stageFixture(),
      latestNote: "Migration passes",
      commits: [
        {
          sha: "abc123",
          projectId: "p1",
          branch: "main",
          message: "Add migration",
          authorName: "Clyde",
          committedAt: "2026-05-20T10:00:00Z",
          changedFiles: ["src-tauri/migrations/001_init.sql"]
        }
      ],
      workEntries: [],
      inboxItems: [],
      nextTasks: [],
      hasPlan: true
    });

    expect(view.state).toBe("ready");
    expect(view.heading).toBe("Continue where you left off");
    expect(view.primaryTaskTitle).toBe("Create local store");
    expect(view.stageTitle).toBe("Foundation");
    expect(view.latestNote).toBe("Migration passes");
    expect(view.nextStep).toBe("Run repository tests");
    expect(view.facts).toContain("1 recent commit on main");
    expect(view.primaryActionLabel).toBe("Continue task");
  });

  it("builds setup guidance when no plan exists", () => {
    const view = buildResumeBriefView({
      task: null,
      stage: null,
      latestNote: "",
      commits: [],
      workEntries: [],
      inboxItems: [],
      nextTasks: [],
      hasPlan: false
    });

    expect(view.state).toBe("no-plan");
    expect(view.primaryTaskTitle).toBe("No plan imported");
    expect(view.primaryActionLabel).toBe("Import a plan");
  });

  it("builds plan guidance when a plan has no active task", () => {
    const view = buildResumeBriefView({
      task: null,
      stage: null,
      latestNote: "",
      commits: [],
      workEntries: [],
      inboxItems: [],
      nextTasks: [taskFixture({ title: "Create shell" })],
      hasPlan: true
    });

    expect(view.state).toBe("no-active-task");
    expect(view.primaryActionLabel).toBe("Pick a task from Plan");
    expect(view.nextTasks[0].title).toBe("Create shell");
  });

  it("calls out missing next step for the active task", () => {
    const view = buildResumeBriefView({
      task: taskFixture({ title: "Create shell", nextStep: "" }),
      stage: stageFixture({ title: "Alpha UX" }),
      latestNote: "",
      commits: [],
      workEntries: [],
      inboxItems: [],
      nextTasks: [],
      hasPlan: true
    });

    expect(view.state).toBe("missing-next-step");
    expect(view.nextStep).toBe("Set the next concrete step before continuing.");
    expect(view.primaryActionLabel).toBe("Set next step");
  });

  it("keeps the next-up list to the first three tasks", () => {
    const view = buildResumeBriefView({
      task: taskFixture(),
      stage: stageFixture(),
      latestNote: "",
      commits: [],
      workEntries: [],
      inboxItems: [],
      nextTasks: [
        taskFixture({ id: "t2", title: "Wire commands" }),
        taskFixture({ id: "t3", title: "Add timeline" }),
        taskFixture({ id: "t4", title: "Build utilities" }),
        taskFixture({ id: "t5", title: "Polish shell" })
      ],
      hasPlan: true
    });

    expect(view.nextTasks.map((task) => task.title)).toEqual([
      "Wire commands",
      "Add timeline",
      "Build utilities"
    ]);
  });
});
