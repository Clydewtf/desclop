import { describe, expect, it } from "vitest";
import { buildResumeBriefView } from "./resumeEngine";

describe("buildResumeBriefView", () => {
  it("prioritizes active task, latest note, recent commits, and next step", () => {
    const view = buildResumeBriefView({
      task: {
        id: "t1",
        projectId: "p1",
        stageId: "s1",
        title: "Create local store",
        description: "",
        status: "active",
        priority: null,
        dueDate: null,
        nextStep: "Run repository tests",
        position: 0
      },
      stage: {
        id: "s1",
        projectId: "p1",
        title: "Foundation",
        description: "",
        position: 0,
        status: "current"
      },
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
      nextTasks: []
    });

    expect(view.heading).toBe("Continue where you left off");
    expect(view.primaryTaskTitle).toBe("Create local store");
    expect(view.stageTitle).toBe("Foundation");
    expect(view.latestNote).toBe("Migration passes");
    expect(view.nextStep).toBe("Run repository tests");
    expect(view.facts).toContain("1 recent commit on main");
  });
});
