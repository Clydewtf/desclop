import { describe, expect, it } from "vitest";
import type { ChecklistItem, Stage, Task } from "../../shared/domain/types";
import { buildPlannerFrames } from "./plannerEngine";

describe("buildPlannerFrames", () => {
  it("sorts stages, collapses completed stages, attaches sorted tasks and checklist, and computes progress", () => {
    const stages: Stage[] = [
      {
        id: "stage-current",
        projectId: "project-1",
        title: "Build planner",
        description: "",
        position: 2,
        status: "current"
      },
      {
        id: "stage-completed",
        projectId: "project-1",
        title: "Bootstrap",
        description: "",
        position: 1,
        status: "completed"
      }
    ];
    const tasks: Task[] = [
      task({ id: "task-current-2", stageId: "stage-current", title: "Wire command", position: 2, status: "todo" }),
      task({ id: "task-completed", stageId: "stage-completed", title: "Import markdown", position: 0, status: "done" }),
      task({ id: "task-current-1", stageId: "stage-current", title: "Create local store", position: 1, status: "active" })
    ];
    const checklistItems: ChecklistItem[] = [
      { id: "check-2", taskId: "task-current-1", title: "Render frame", completed: false, position: 2 },
      { id: "check-1", taskId: "task-current-1", title: "Build engine", completed: true, position: 1 },
      { id: "check-3", taskId: "task-completed", title: "Parse headings", completed: true, position: 0 }
    ];

    const frames = buildPlannerFrames(stages, tasks, checklistItems);

    expect(frames.map((frame) => frame.stage.id)).toEqual(["stage-completed", "stage-current"]);
    expect(frames[0].collapsed).toBe(true);
    expect(frames[1].collapsed).toBe(false);
    expect(frames[1].tasks.map((task) => task.id)).toEqual([
      "task-current-1",
      "task-current-2"
    ]);
    expect(frames[1].tasks[0].checklist.map((item) => item.id)).toEqual(["check-1", "check-2"]);
    expect(frames[1].progress).toEqual({
      completedTasks: 0,
      totalTasks: 2,
      completedChecklist: 1,
      totalChecklist: 2
    });
    expect(frames[0].progress).toEqual({
      completedTasks: 1,
      totalTasks: 1,
      completedChecklist: 1,
      totalChecklist: 1
    });
  });
});

function task(overrides: Pick<Task, "id" | "stageId" | "title" | "position" | "status">): Task {
  return {
    projectId: "project-1",
    description: "",
    priority: null,
    dueDate: null,
    nextStep: "",
    ...overrides
  };
}
