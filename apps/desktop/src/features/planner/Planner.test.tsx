import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Planner } from "./Planner";
import type { PlannerFrame } from "./plannerEngine";

describe("Planner", () => {
  it("renders Plan as a readable stage map with task next steps", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const frames: PlannerFrame[] = [
      {
        stage: {
          id: "stage-1",
          projectId: "project-1",
          title: "Completed foundation",
          description: "",
          position: 0,
          status: "completed"
        },
        collapsed: true,
        recommendedTaskId: null,
        progress: {
          completedTasks: 1,
          totalTasks: 3,
          completedChecklist: 2,
          totalChecklist: 4,
          percent: 33,
          tasksLabel: "1/3 tasks",
          checklistLabel: "2/4 checklist"
        },
        tasks: [
          {
            id: "t1",
            projectId: "project-1",
            stageId: "stage-1",
            title: "Import markdown plan",
            description: "",
            status: "done",
            priority: "normal",
            dueDate: null,
            nextStep: "",
            position: 0,
            checklist: []
          }
        ]
      },
      {
        stage: {
          id: "stage-2",
          projectId: "project-1",
          title: "Restructure Today",
          description: "",
          position: 1,
          status: "current"
        },
        collapsed: false,
        recommendedTaskId: "t2",
        progress: {
          completedTasks: 0,
          totalTasks: 2,
          completedChecklist: 2,
          totalChecklist: 5,
          percent: 0,
          tasksLabel: "0/2 tasks",
          checklistLabel: "2/5 checklist"
        },
        tasks: [
          {
            id: "t2",
            projectId: "project-1",
            stageId: "stage-2",
            title: "Restructure Today",
            description: "",
            status: "active",
            priority: "normal",
            dueDate: null,
            nextStep: "Run Today component tests",
            position: 0,
            checklist: [
              {
                id: "c1",
                taskId: "t2",
                title: "Update tests",
                completed: true,
                position: 0
              },
              {
                id: "c2",
                taskId: "t2",
                title: "Run component tests",
                completed: false,
                position: 1
              }
            ]
          }
        ]
      }
    ];

    renderWithRouter(<Planner frames={frames} onOpenTask={onOpenTask} />);

    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Completed foundation" })).toBeInTheDocument();
    expect(screen.getByText("1/3 tasks")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Next: Run Today component tests")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Restructure Today progress" })
    ).toHaveAttribute("aria-valuenow", "0");
    const continueButton = screen.getByRole("button", {
      name: "Continue Restructure Today"
    });
    expect(continueButton).toHaveTextContent(/^Continue$/);

    await user.click(continueButton);

    expect(onOpenTask).toHaveBeenCalledWith("t2", { activate: true });
  });

  it("opens a completed task without activating it", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const frames: PlannerFrame[] = [
      {
        stage: {
          id: "stage-1",
          projectId: "project-1",
          title: "Polish release",
          description: "",
          position: 0,
          status: "current"
        },
        collapsed: false,
        recommendedTaskId: null,
        progress: {
          completedTasks: 1,
          totalTasks: 1,
          completedChecklist: 0,
          totalChecklist: 0,
          percent: 100,
          tasksLabel: "1/1 tasks",
          checklistLabel: null
        },
        tasks: [
          {
            id: "t1",
            projectId: "project-1",
            stageId: "stage-1",
            title: "Publish release notes",
            description: "",
            status: "done",
            priority: "normal",
            dueDate: null,
            nextStep: "",
            position: 0,
            checklist: []
          }
        ]
      }
    ];

    renderWithRouter(<Planner frames={frames} onOpenTask={onOpenTask} />);

    const openButton = screen.getByRole("button", {
      name: "Open Publish release notes"
    });
    expect(openButton).toHaveTextContent(/^Open$/);

    await user.click(openButton);

    expect(onOpenTask).toHaveBeenCalledWith("t1", { activate: false });
  });
});
