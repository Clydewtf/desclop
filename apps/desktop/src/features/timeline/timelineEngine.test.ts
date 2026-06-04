import { describe, expect, it } from "vitest";
import type { Task } from "../../shared/domain/types";
import { buildTimeline } from "./timelineEngine";

describe("buildTimeline", () => {
  it("combines dated work entries, commits, notes, inbox events, and completed tasks by time", () => {
    const completedTask: Task & { completedAt: string } = {
      id: "t1",
      projectId: "p1",
      stageId: "s1",
      title: "Finish parser",
      description: "",
      status: "done",
      priority: null,
      dueDate: null,
      nextStep: "",
      position: 1,
      completedAt: "2026-05-20T10:05:00Z"
    };
    const undatedCompletedTask: Task = {
      id: "t2",
      projectId: "p1",
      stageId: "s1",
      title: "Undated cleanup",
      description: "",
      status: "done",
      priority: null,
      dueDate: null,
      nextStep: "",
      position: 2
    };

    const timeline = buildTimeline({
      workEntries: [
        {
          id: "w1",
          projectId: "p1",
          taskId: "t1",
          source: "manual",
          startedAt: null,
          endedAt: null,
          durationSeconds: null,
          done: "Added parser",
          remains: "",
          nextStep: "",
          createdAt: "2026-05-20T10:00:00Z"
        }
      ],
      commits: [
        {
          sha: "abc123",
          projectId: "p1",
          branch: "main",
          message: "Add parser",
          authorName: "Clyde",
          committedAt: "2026-05-20T10:10:00Z",
          changedFiles: ["parser.ts"]
        }
      ],
      notes: [
        {
          id: "n1",
          projectId: "p1",
          taskId: "t1",
          body: "Parser warnings need review",
          createdAt: "2026-05-20T10:20:00Z"
        }
      ],
      inboxItems: [
        {
          id: "i1",
          projectId: "p1",
          taskId: "t1",
          body: "Review parser errors",
          kind: "task_candidate",
          status: "open",
          createdAt: "2026-05-20T10:15:00Z",
          updatedAt: "2026-05-20T10:15:00Z"
        }
      ],
      completedTasks: [completedTask, undatedCompletedTask]
    });

    expect(timeline.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "note:n1",
      "inbox:i1",
      "commit:abc123",
      "task:t1",
      "work:w1",
      "task:t2"
    ]);
    expect(timeline.summary).toBe("1 work entry, 1 commit, 1 note");
  });
});
