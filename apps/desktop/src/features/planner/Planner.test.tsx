import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Planner } from "./Planner";
import type { PlanFrame, PlannerFrame } from "./plannerEngine";

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
          description: "The completed storage foundation.",
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
            description: "Use the explicit import contract.",
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
          description: "The stage that makes resume context actionable.",
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
            description: "Keep the task small and resumable.",
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
                description: "Use the focused test command before opening the task.",
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
    expect(screen.queryByText("The completed storage foundation.")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand stage Completed foundation" })
    );
    expect(screen.getByText("The completed storage foundation.")).toBeInTheDocument();
    expect(screen.getByText("Keep the task small and resumable.")).toBeInTheDocument();
    expect(
      screen.getByText("Use the focused test command before opening the task.")
    ).toBeInTheDocument();
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
          status: "completed"
        },
        collapsed: true,
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

    expect(screen.queryByRole("button", {
      name: "Open Publish release notes"
    })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show plan Imported plan" }));
    await user.click(screen.getByRole("button", { name: "Expand stage Polish release" }));

    const openButton = screen.getByRole("button", {
      name: "Open Publish release notes"
    });
    expect(openButton).toHaveTextContent(/^Open$/);

    await user.click(openButton);

    expect(onOpenTask).toHaveBeenCalledWith("t1", { activate: false });
  });

  it("puts the current plan first and lets Continue select another plan", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const planFrames = [
      planFrameFixture({
        planId: "plan-1",
        title: "Main plan",
        isCurrent: false,
        taskId: "t1",
        taskTitle: "Main next"
      }),
      planFrameFixture({
        planId: "plan-2",
        title: "Fix plan",
        isCurrent: true,
        taskId: "t2",
        taskTitle: "Fix next"
      })
    ];

    renderWithRouter(
      <Planner planFrames={planFrames} onOpenTask={onOpenTask} />
    );

    const planArticles = screen
      .getAllByRole("article")
      .filter((article) => article.classList.contains("plan-frame"));
    expect(
      planArticles.map(
        (article) => article.querySelector(".plan-frame__header h2")?.textContent
      )
    ).toEqual([
      "Fix plan",
      "Main plan"
    ]);
    expect(screen.getByText("Current working plan")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue plan Main plan" }));

    expect(onOpenTask).toHaveBeenCalledWith("t1", { activate: true });
  });

  it("hides and restores a completed plan without changing its summary", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const onArchivePlan = vi.fn();
    const onRestorePlan = vi.fn();
    const planFrames = [
      planFrameFixture({
        planId: "completed-plan",
        title: "Finished release",
        collapsed: true,
        isCurrent: false,
        taskId: "done-task",
        taskTitle: "Ship release",
        taskStatus: "done"
      }),
      planFrameFixture({
        planId: "open-plan",
        title: "Current work",
        isCurrent: true,
        taskId: "open-task",
        taskTitle: "Continue work"
      })
    ];

    const view = renderWithRouter(
      <Planner
        planFrames={planFrames}
        onArchivePlan={onArchivePlan}
        onRestorePlan={onRestorePlan}
        onOpenTask={onOpenTask}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Hide completed plan Finished release" })
    );
    expect(onArchivePlan).toHaveBeenCalledWith("completed-plan");

    view.rerender(
      <Planner
        planFrames={planFrames}
        archivedPlanIds={["completed-plan"]}
        onArchivePlan={onArchivePlan}
        onRestorePlan={onRestorePlan}
        onOpenTask={onOpenTask}
      />
    );

    expect(screen.getByRole("heading", { name: "Hidden completed plans" })).toBeInTheDocument();
    expect(screen.getByText("1/1 tasks")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Restore plan Finished release" })
    );
    expect(onRestorePlan).toHaveBeenCalledWith("completed-plan");
  });

  it("enters Edit plan explicitly and returns focus after cancelling without changes", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const planFrames = [
      planFrameFixture({
        planId: "current-plan",
        title: "Current work",
        isCurrent: true,
        taskId: "task-1",
        taskTitle: "Keep moving"
      }),
      planFrameFixture({
        planId: "other-plan",
        title: "Other work",
        isCurrent: false,
        taskId: "task-2",
        taskTitle: "Review later"
      })
    ];

    renderWithRouter(<Planner planFrames={planFrames} onOpenTask={onOpenTask} />);

    const editButton = screen.getByRole("button", { name: "Edit plan Current work" });
    expect(screen.queryByRole("region", { name: "Editing Current work" })).not.toBeInTheDocument();

    await user.click(editButton);

    expect(screen.getByRole("region", { name: "Editing Current work" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No unsaved changes");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit plan Other work" })).not.toBeInTheDocument();
    expect(onOpenTask).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("region", { name: "Editing Current work" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit plan Current work" })).toHaveFocus();
  });

  it("keeps plan and stage edits local until the confirmed save", async () => {
    const user = userEvent.setup();
    const onSavePlan = vi.fn().mockResolvedValue(undefined);
    const planFrames = [
      planFrameFixture({
        planId: "current-plan",
        title: "Current work",
        isCurrent: true,
        taskId: "task-1",
        taskTitle: "Keep moving"
      })
    ];

    renderWithRouter(
      <Planner
        planFrames={planFrames}
        onSavePlan={onSavePlan}
        onOpenTask={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    await user.clear(screen.getByRole("textbox", { name: "Plan title" }));
    await user.type(screen.getByRole("textbox", { name: "Plan title" }), "Release plan");
    await user.clear(screen.getByRole("textbox", { name: "Stage title" }));
    await user.type(screen.getByRole("textbox", { name: "Stage title" }), "Build release");
    await user.click(screen.getByRole("button", { name: "Add stage" }));

    expect(screen.getByRole("textbox", { name: "Plan title" })).toHaveValue("Release plan");
    expect(screen.getAllByRole("textbox", { name: "Stage title" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Move stage New stage up" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Move stage New stage up" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("dialog", { name: "Save plan changes?" })).toBeInTheDocument();
    expect(onSavePlan).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSavePlan).toHaveBeenCalledTimes(1));
    expect(onSavePlan).toHaveBeenCalledWith({
      planId: "current-plan",
      title: "Release plan",
      stages: [
        {
          id: "draft-stage-1",
          title: "New stage",
          description: "",
          isNew: true
        },
        {
          id: "current-plan-stage",
          title: "Build release",
          description: "",
          isNew: false
        }
      ],
      deletedStageIds: []
    });
    expect(screen.queryByRole("region", { name: "Editing Current work" })).not.toBeInTheDocument();
  });

  it("warns instead of deleting a stage that still contains tasks", async () => {
    const user = userEvent.setup();
    const planFrames = [
      planFrameFixture({
        planId: "current-plan",
        title: "Current work",
        isCurrent: true,
        taskId: "task-1",
        taskTitle: "Keep moving"
      })
    ];

    renderWithRouter(<Planner planFrames={planFrames} onOpenTask={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    await user.click(screen.getByRole("button", { name: "Delete stage Current work stage" }));

    expect(
      screen.getByText("Move or remove this stage's tasks before deleting the stage.")
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Stage title" })).toHaveValue(
      "Current work stage"
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

function planFrameFixture({
  planId,
  title,
  isCurrent,
  taskId,
  taskTitle,
  taskStatus = "todo",
  collapsed = false
}: {
  planId: string;
  title: string;
  isCurrent: boolean;
  taskId: string;
  taskTitle: string;
  taskStatus?: "todo" | "done";
  collapsed?: boolean;
}): PlanFrame {
  const stageId = `${planId}-stage`;
  const stageStatus = collapsed ? "completed" : "current";
  const task = {
    id: taskId,
    projectId: "project-1",
    stageId,
    title: taskTitle,
    description: "",
    status: taskStatus,
    priority: "normal" as const,
    dueDate: null,
    nextStep: taskStatus === "done" ? "" : "Keep moving",
    position: 0,
    checklist: []
  };
  const stageFrame: PlannerFrame = {
    stage: {
      id: stageId,
      projectId: "project-1",
      planId,
      title: `${title} stage`,
      description: "",
      position: 0,
      status: stageStatus
    },
    collapsed,
    recommendedTaskId: taskStatus === "done" ? null : taskId,
    tasks: [task],
    progress: {
      completedTasks: taskStatus === "done" ? 1 : 0,
      totalTasks: 1,
      completedChecklist: 0,
      totalChecklist: 0,
      percent: taskStatus === "done" ? 100 : 0,
      tasksLabel: taskStatus === "done" ? "1/1 tasks" : "0/1 tasks",
      checklistLabel: null
    }
  };

  return {
    plan: {
      id: planId,
      projectId: "project-1",
      title,
      position: planId === "plan-1" ? 0 : planId === "plan-2" ? 1 : 2
    },
    collapsed,
    isCurrent,
    recommendedTaskId: taskStatus === "done" ? null : taskId,
    stageFrames: [stageFrame],
    progress: stageFrame.progress
  };
}
