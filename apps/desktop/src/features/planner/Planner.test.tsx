import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Planner } from "./Planner";
import type { PlannerFrame } from "./plannerEngine";

describe("Planner", () => {
  it("renders a planner frame with a task and continues that task", async () => {
    const user = userEvent.setup();
    const onContinueTask = vi.fn();
    const frames: PlannerFrame[] = [
      {
        stage: {
          id: "stage-1",
          projectId: "project-1",
          title: "Foundation",
          description: "",
          position: 0,
          status: "current"
        },
        collapsed: false,
        progress: {
          completedTasks: 0,
          totalTasks: 1,
          completedChecklist: 0,
          totalChecklist: 1
        },
        tasks: [
          {
            id: "task-1",
            projectId: "project-1",
            stageId: "stage-1",
            title: "Create local store",
            description: "",
            status: "active",
            priority: "normal",
            dueDate: null,
            nextStep: "Add migration",
            position: 0,
            checklist: [
              {
                id: "check-1",
                taskId: "task-1",
                title: "Add migration",
                completed: false,
                position: 0
              }
            ]
          }
        ]
      }
    ];

    renderWithRouter(<Planner frames={frames} onContinueTask={onContinueTask} />);

    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
    expect(screen.getByText("Create local store")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue Create local store" }));

    expect(onContinueTask).toHaveBeenCalledWith("task-1");
  });
});
