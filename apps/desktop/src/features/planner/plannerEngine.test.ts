import { describe, expect, it } from "vitest";
import type { ChecklistItem, Stage, Task } from "../../shared/domain/types";
import { buildPlanFrames, buildPlannerFrames } from "./plannerEngine";

describe("buildPlannerFrames", () => {
  it("collapses completed stages and expands the current stage", () => {
    const frames = buildPlannerFrames(
      [
        stageFixture({ id: "s1", title: "Done stage", status: "completed", position: 0 }),
        stageFixture({ id: "s2", title: "Current stage", status: "current", position: 1 }),
        stageFixture({ id: "s3", title: "Future stage", status: "future", position: 2 })
      ],
      [
        taskFixture({ id: "t1", stageId: "s1", status: "done", position: 0 }),
        taskFixture({
          id: "t2",
          stageId: "s2",
          status: "active",
          nextStep: "Run visual QA",
          position: 0
        })
      ],
      []
    );

    expect(frames[0].collapsed).toBe(true);
    expect(frames[1].collapsed).toBe(false);
    expect(frames[2].collapsed).toBe(false);
    expect(frames[1].tasks[0].nextStep).toBe("Run visual QA");
  });

  it("marks the active task as recommended and computes progress percent", () => {
    const frames = buildPlannerFrames(
      [stageFixture({ id: "stage-current", title: "Current", status: "current", position: 0 })],
      [
        taskFixture({ id: "task-1", stageId: "stage-current", status: "active", position: 0, nextStep: "Run component tests" }),
        taskFixture({ id: "task-2", stageId: "stage-current", status: "done", position: 1 })
      ],
      [
        { id: "check-1", taskId: "task-1", title: "Test", completed: true, position: 0 },
        { id: "check-2", taskId: "task-2", title: "Polish", completed: false, position: 0 }
      ],
      "task-1"
    );

    expect(frames[0].recommendedTaskId).toBe("task-1");
    expect(frames[0].progress.percent).toBe(50);
    expect(frames[0].progress.checklistLabel).toBe("1/2 checklist");
  });

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
      totalChecklist: 2,
      percent: 0,
      tasksLabel: "0/2 tasks",
      checklistLabel: "1/2 checklist"
    });
    expect(frames[0].progress).toEqual({
      completedTasks: 1,
      totalTasks: 1,
      completedChecklist: 1,
      totalChecklist: 1,
      percent: 100,
      tasksLabel: "1/1 tasks",
      checklistLabel: "1/1 checklist"
    });
  });
});

describe("buildPlanFrames", () => {
  it("groups stages by plan and collapses completed plans", () => {
    const frames = buildPlanFrames(
      [
        { id: "plan-1", projectId: "project-1", title: "Main plan", position: 0 },
        { id: "plan-2", projectId: "project-1", title: "Fix plan", position: 1 }
      ],
      [
        stageFixture({
          id: "s1",
          planId: "plan-1",
          title: "Completed main stage",
          status: "completed",
          position: 0
        }),
        stageFixture({
          id: "s2",
          planId: "plan-2",
          title: "Fix current stage",
          status: "current",
          position: 0
        })
      ],
      [
        taskFixture({ id: "t1", stageId: "s1", status: "done", position: 0 }),
        taskFixture({ id: "t2", stageId: "s2", status: "todo", position: 0 })
      ],
      []
    );

    expect(frames.map((frame) => frame.plan.title)).toEqual(["Main plan", "Fix plan"]);
    expect(frames[0].collapsed).toBe(true);
    expect(frames[1].collapsed).toBe(false);
    expect(frames[0].stageFrames.map((frame) => frame.stage.id)).toEqual(["s1"]);
    expect(frames[1].stageFrames.map((frame) => frame.stage.id)).toEqual(["s2"]);
  });
});

function stageFixture(overrides: Pick<Stage, "id" | "title" | "status" | "position"> & Partial<Pick<Stage, "planId">>): Stage {
  return {
    projectId: "project-1",
    planId: "plan-1",
    description: "",
    ...overrides
  };
}

function taskFixture(
  overrides: Pick<Task, "id" | "stageId" | "status" | "position"> & Partial<Pick<Task, "title" | "nextStep">>
): Task {
  return {
    projectId: "project-1",
    title: "Task",
    description: "",
    priority: null,
    dueDate: null,
    nextStep: "",
    ...overrides
  };
}

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
