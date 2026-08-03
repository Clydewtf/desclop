import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

    const view = render(
      <Planner
        planFrames={planFrames}
        onArchivePlan={onArchivePlan}
        onRestorePlan={onRestorePlan}
        onOpenTask={onOpenTask}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Archive completed plan Finished release" })
    );
    expect(onArchivePlan).toHaveBeenCalledWith("completed-plan");

    view.rerender(
      <Planner
        planFrames={planFrames.map((planFrame) =>
          planFrame.plan.id === "completed-plan"
            ? {
                ...planFrame,
                plan: { ...planFrame.plan, archivedAt: "2026-08-04T00:00:00Z" }
              }
            : planFrame
        )}
        onArchivePlan={onArchivePlan}
        onRestorePlan={onRestorePlan}
        onOpenTask={onOpenTask}
      />
    );

    expect(screen.getByRole("heading", { name: "Archived completed plans" })).toBeInTheDocument();
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

  it("keeps existing task and checklist editors compact until they are needed", async () => {
    const user = userEvent.setup();
    const planFrames = [
      planFrameFixture({
        planId: "current-plan",
        title: "Current work",
        isCurrent: true,
        taskId: "task-1",
        taskTitle: "Keep moving",
        checklist: [{ id: "check-1", title: "Check source" }]
      })
    ];

    renderWithRouter(<Planner planFrames={planFrames} onOpenTask={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    const task = screen
      .getByRole("button", { name: "Expand task Keep moving" })
      .closest<HTMLElement>(".planner-edit-task");
    expect(task).not.toBeNull();
    expect(within(task!).queryByRole("textbox", { name: "Task title" })).not.toBeInTheDocument();
    expect(
      within(task!).getByRole("button", { name: "Delete task Keep moving" })
    ).toBeInTheDocument();

    await user.click(within(task!).getByRole("button", { name: "Expand task Keep moving" }));
    expect(within(task!).getByRole("textbox", { name: "Task title" })).toBeInTheDocument();
    await user.click(
      within(task!).getByRole("button", { name: "Expand checklist for Keep moving" })
    );

    expect(
      within(task!).getByRole("textbox", { name: "Checklist item title" })
    ).toBeInTheDocument();
    await user.click(
      within(task!).getByRole("button", { name: "Collapse checklist for Keep moving" })
    );

    expect(
      within(task!).queryByRole("textbox", { name: "Checklist item title" })
    ).not.toBeInTheDocument();
    expect(
      within(task!).getByRole("button", { name: "Expand checklist for Keep moving" })
    ).toBeInTheDocument();
  });

  it("resolves an external leave only after the user saves or discards a changed draft", async () => {
    const user = userEvent.setup();
    const onSavePlan = vi.fn().mockResolvedValue(undefined);
    const onResolveLeaveRequest = vi.fn();
    const planFrames = [
      planFrameFixture({
        planId: "current-plan",
        title: "Current work",
        isCurrent: true,
        taskId: "task-1",
        taskTitle: "Keep moving"
      })
    ];
    const view = render(
      <Planner
        planFrames={planFrames}
        onSavePlan={onSavePlan}
        onResolveLeaveRequest={onResolveLeaveRequest}
        onOpenTask={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    await user.clear(screen.getByRole("textbox", { name: "Plan title" }));
    await user.type(screen.getByRole("textbox", { name: "Plan title" }), "Release plan");

    view.rerender(
      <Planner
        planFrames={planFrames}
        leaveRequest={{ id: 1 }}
        onSavePlan={onSavePlan}
        onResolveLeaveRequest={onResolveLeaveRequest}
        onOpenTask={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(onResolveLeaveRequest).toHaveBeenCalledWith(1, "stay");
    expect(screen.getByRole("textbox", { name: "Plan title" })).toHaveValue("Release plan");

    view.rerender(
      <Planner
        planFrames={planFrames}
        leaveRequest={null}
        onSavePlan={onSavePlan}
        onResolveLeaveRequest={onResolveLeaveRequest}
        onOpenTask={vi.fn()}
      />
    );
    view.rerender(
      <Planner
        planFrames={planFrames}
        leaveRequest={{ id: 2 }}
        onSavePlan={onSavePlan}
        onResolveLeaveRequest={onResolveLeaveRequest}
        onOpenTask={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSavePlan).toHaveBeenCalledTimes(1));
    expect(onResolveLeaveRequest).toHaveBeenCalledWith(2, "save");
    expect(screen.queryByRole("region", { name: "Editing Current work" })).not.toBeInTheDocument();
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
    const newStageHandle = screen.getByRole("button", { name: "Drag stage New stage" });
    const newStage = newStageHandle.closest<HTMLElement>(".planner-edit-stage");
    const currentStage = screen
      .getAllByRole<HTMLInputElement>("textbox", { name: "Stage title" })
      .find((input) => input.value === "Build release")
      ?.closest<HTMLElement>(".planner-edit-stage");
    expect(newStageHandle).toBeInTheDocument();
    expect(newStage).not.toBeNull();
    expect(currentStage).not.toBeNull();

    vi.spyOn(newStage!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 200,
      top: 200,
      right: 640,
      bottom: 320,
      left: 0,
      width: 640,
      height: 120,
      toJSON: () => ({})
    });
    vi.spyOn(currentStage!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 40,
      top: 40,
      right: 640,
      bottom: 160,
      left: 0,
      width: 640,
      height: 120,
      toJSON: () => ({})
    });

    fireEvent.pointerDown(newStage!, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 24,
      clientY: 220
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      isPrimary: true,
      clientX: 24,
      clientY: 80
    });

    await waitFor(() => {
      expect(
        Array.from(
          document.querySelectorAll<HTMLInputElement>(
            ".planner-edit-stage-list .planner-edit-stage__fields input"
          )
        ).map((input) => input.value)
      ).toEqual(["New stage", "Build release"]);
    });

    fireEvent.pointerUp(window, {
      pointerId: 1,
      isPrimary: true,
      clientX: 24,
      clientY: 80
    });
    expect(document.querySelector(".planner-edit-stage--dragging")).not.toBeInTheDocument();
    expect(document.querySelector(".planner-edit-stage__placeholder")).not.toBeInTheDocument();
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
          isNew: true,
          tasks: []
        },
        {
          id: "current-plan-stage",
          title: "Build release",
          description: "",
          isNew: false,
          tasks: [
            {
              id: "task-1",
              title: "Keep moving",
              description: "",
              isNew: false,
              checklist: []
            }
          ]
        }
      ],
      deletedStageIds: [],
      deletedTaskIds: [],
      confirmedTaskDeletionIds: [],
      deletedChecklistItemIds: [],
      confirmedChecklistItemIds: []
    });
    expect(screen.queryByRole("region", { name: "Editing Current work" })).not.toBeInTheDocument();
  });

  it("validates every required editor title without losing the local draft", async () => {
    const user = userEvent.setup();
    const onSavePlan = vi.fn().mockResolvedValue(undefined);
    const planFrames = [
      planFrameFixture({
        planId: "current-plan",
        title: "Current work",
        isCurrent: true,
        taskId: "task-1",
        taskTitle: "Keep moving",
        checklist: [{ id: "check-1", title: "Check source" }]
      })
    ];

    renderWithRouter(
      <Planner planFrames={planFrames} onSavePlan={onSavePlan} onOpenTask={vi.fn()} />
    );

    async function attemptSave() {
      await user.click(screen.getByRole("button", { name: "Save" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));
    }

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));

    const planTitle = screen.getByRole("textbox", { name: "Plan title" });
    await user.clear(planTitle);
    await user.type(planTitle, "   ");
    await attemptSave();
    expect(screen.getByText("Enter a name before saving.")).toBeInTheDocument();
    expect(planTitle).toHaveFocus();
    expect(planTitle).toHaveAttribute("aria-invalid", "true");
    expect(onSavePlan).not.toHaveBeenCalled();

    await user.clear(planTitle);
    await user.type(planTitle, "Current work");
    const stageTitle = screen.getByRole("textbox", { name: "Stage title" });
    await user.clear(stageTitle);
    await user.type(stageTitle, "  ");
    await attemptSave();
    expect(stageTitle).toHaveFocus();
    expect(stageTitle).toHaveAttribute("aria-invalid", "true");

    await user.clear(stageTitle);
    await user.type(stageTitle, "Current work stage");
    const taskTitle = screen.getByRole("textbox", { name: "Task title" });
    await user.clear(taskTitle);
    await user.type(taskTitle, "  ");
    await attemptSave();
    expect(taskTitle).toHaveFocus();
    expect(taskTitle).toHaveAttribute("aria-invalid", "true");

    await user.clear(taskTitle);
    await user.type(taskTitle, "Keep moving");
    const checklistTitle = screen.getByRole("textbox", { name: "Checklist item title" });
    await user.clear(checklistTitle);
    await user.type(checklistTitle, "  ");
    await attemptSave();
    expect(checklistTitle).toHaveFocus();
    expect(checklistTitle).toHaveAttribute("aria-invalid", "true");
    expect(onSavePlan).not.toHaveBeenCalled();

    const restoredChecklistTitle = screen.getByRole("textbox", { name: "Checklist item title" });
    await user.clear(restoredChecklistTitle);
    await user.type(restoredChecklistTitle, "Check source reviewed");
    await attemptSave();

    await waitFor(() => expect(onSavePlan).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: "Editing Current work" })).not.toBeInTheDocument();
  });

  it("batches stage pointer updates and commits the draft reorder only on drop", async () => {
    const user = userEvent.setup();
    const firstPlanFrame = planFrameFixture({
      planId: "current-plan",
      title: "Current work",
      isCurrent: true,
      taskId: "task-1",
      taskTitle: "Keep moving"
    });
    const secondStage: PlannerFrame = {
      stage: {
        id: "second-stage",
        projectId: "project-1",
        planId: "current-plan",
        title: "Second stage",
        description: "",
        position: 1,
        status: "future"
      },
      collapsed: false,
      recommendedTaskId: null,
      tasks: [],
      progress: {
        completedTasks: 0,
        totalTasks: 0,
        completedChecklist: 0,
        totalChecklist: 0,
        percent: 0,
        tasksLabel: "0/0 tasks",
        checklistLabel: null
      }
    };
    const planFrames: PlanFrame[] = [
      {
        ...firstPlanFrame,
        stageFrames: [...firstPlanFrame.stageFrames, secondStage]
      }
    ];

    renderWithRouter(<Planner planFrames={planFrames} onOpenTask={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    const firstStage = screen
      .getByRole("button", { name: "Drag stage Current work stage" })
      .closest<HTMLElement>(".planner-edit-stage");
    const secondStageCard = screen
      .getByRole("button", { name: "Drag stage Second stage" })
      .closest<HTMLElement>(".planner-edit-stage");
    expect(firstStage).not.toBeNull();
    expect(secondStageCard).not.toBeNull();

    vi.spyOn(firstStage!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 40,
      top: 40,
      right: 640,
      bottom: 160,
      left: 0,
      width: 640,
      height: 120,
      toJSON: () => ({})
    });
    vi.spyOn(secondStageCard!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 200,
      top: 200,
      right: 640,
      bottom: 320,
      left: 0,
      width: 640,
      height: 120,
      toJSON: () => ({})
    });

    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 1);

    try {
      fireEvent.pointerDown(secondStageCard!, {
        pointerId: 1,
        button: 0,
        isPrimary: true,
        clientX: 24,
        clientY: 220
      });
      fireEvent.pointerMove(window, {
        pointerId: 1,
        isPrimary: true,
        clientX: 24,
        clientY: 80
      });
      fireEvent.pointerMove(window, {
        pointerId: 1,
        isPrimary: true,
        clientX: 24,
        clientY: 64
      });

      expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      fireEvent.pointerUp(window, {
        pointerId: 1,
        isPrimary: true,
        clientX: 24,
        clientY: 64
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
        expect(
          Array.from(
            document.querySelectorAll<HTMLInputElement>(
              ".planner-edit-stage-list .planner-edit-stage__fields input"
            )
          ).map((input) => input.value)
        ).toEqual(["Second stage", "Current work stage"]);
      });
    } finally {
      requestAnimationFrame.mockRestore();
    }
  });

  it("edits, moves, and reorders tasks and checklist items in the local draft", async () => {
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
      <Planner planFrames={planFrames} onSavePlan={onSavePlan} onOpenTask={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    await user.click(screen.getByRole("button", { name: "Add stage" }));

    const stageTitleInputs = screen.getAllByRole<HTMLInputElement>("textbox", {
      name: "Stage title"
    });
    const originalStage = stageTitleInputs
      .find((input) => input.value === "Current work stage")
      ?.closest<HTMLElement>(".planner-edit-stage");
    const newStage = stageTitleInputs
      .find((input) => input.value === "New stage")
      ?.closest<HTMLElement>(".planner-edit-stage");
    expect(originalStage).not.toBeNull();
    expect(newStage).not.toBeNull();

    await user.click(within(originalStage!).getByRole("button", { name: "Add task" }));
    const reviewTaskTitle = screen.getByDisplayValue("New task");
    await user.clear(reviewTaskTitle);
    await user.type(reviewTaskTitle, "Review release");
    const reviewTask = screen
      .getByDisplayValue("Review release")
      .closest<HTMLElement>(".planner-edit-task");
    expect(reviewTask).not.toBeNull();
    await user.type(
      within(reviewTask!).getByRole("textbox", { name: "Task description" }),
      "Review the release path"
    );
    await user.selectOptions(
      within(reviewTask!).getByRole("combobox", { name: "Task stage" }),
      "draft-stage-1"
    );

    const refreshedNewStage = screen
      .getAllByRole<HTMLInputElement>("textbox", { name: "Stage title" })
      .find((input) => input.value === "New stage")
      ?.closest<HTMLElement>(".planner-edit-stage");
    expect(refreshedNewStage).not.toBeNull();
    await user.click(within(refreshedNewStage!).getByRole("button", { name: "Add task" }));
    const shipTaskTitle = screen.getByDisplayValue("New task");
    await user.clear(shipTaskTitle);
    await user.type(shipTaskTitle, "Ship docs");
    await user.click(screen.getByRole("button", { name: "Move task Ship docs up" }));

    const shipTask = screen
      .getByDisplayValue("Ship docs")
      .closest<HTMLElement>(".planner-edit-task");
    expect(shipTask).not.toBeNull();
    await user.click(within(shipTask!).getByRole("button", { name: "Add checklist item" }));
    const firstChecklistTitle = within(shipTask!).getByDisplayValue("New checklist item");
    await user.clear(firstChecklistTitle);
    await user.type(firstChecklistTitle, "Write release notes");
    await user.type(
      within(shipTask!).getByRole("textbox", { name: "Checklist item description" }),
      "Describe the changes"
    );
    await user.click(within(shipTask!).getByRole("button", { name: "Add checklist item" }));
    const checklistTitleInputs = within(shipTask!).getAllByRole<HTMLInputElement>("textbox", {
      name: "Checklist item title"
    });
    await user.clear(checklistTitleInputs[1]);
    await user.type(checklistTitleInputs[1], "Run final review");
    await user.click(
      within(shipTask!).getByRole("button", { name: "Move checklist item Run final review up" })
    );

    expect(
      within(shipTask!)
        .getAllByRole<HTMLInputElement>("textbox", { name: "Checklist item title" })
        .map((input) => input.value)
    ).toEqual(["Run final review", "Write release notes"]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSavePlan).toHaveBeenCalledTimes(1));
    const savedDraft = onSavePlan.mock.calls[0]?.[0] as {
      stages: Array<{ id: string; tasks: Array<{ id: string; title: string; checklist: unknown[] }> }>;
    };
    expect(savedDraft.stages.find((stage) => stage.id === "current-plan-stage")?.tasks).toEqual([
      expect.objectContaining({ id: "task-1", title: "Keep moving" })
    ]);
    expect(savedDraft.stages.find((stage) => stage.id === "draft-stage-1")?.tasks).toEqual([
      expect.objectContaining({
        id: "draft-task-2",
        title: "Ship docs",
        checklist: [
          expect.objectContaining({ title: "Run final review" }),
          expect.objectContaining({ title: "Write release notes", description: "Describe the changes" })
        ]
      }),
      expect.objectContaining({
        id: "draft-task-1",
        title: "Review release",
        description: "Review the release path"
      })
    ]);
  });

  it("requires explicit confirmations before removing saved tasks and checklist items", async () => {
    const user = userEvent.setup();
    const onSavePlan = vi.fn().mockResolvedValue(undefined);
    const planFrames = [
      planFrameFixture({
        planId: "current-plan",
        title: "Current work",
        isCurrent: true,
        taskId: "task-1",
        taskTitle: "Keep moving",
        checklist: [{ id: "check-1", title: "Check source" }]
      })
    ];

    renderWithRouter(
      <Planner planFrames={planFrames} onSavePlan={onSavePlan} onOpenTask={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    await user.click(screen.getByRole("button", { name: "Expand task Keep moving" }));
    await user.click(screen.getByRole("button", { name: "Expand checklist for Keep moving" }));
    await user.click(screen.getByRole("button", { name: "Delete checklist item Check source" }));
    expect(screen.getByRole("dialog", { name: "Delete checklist item?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep item" }));
    expect(screen.getByRole("textbox", { name: "Checklist item title" })).toHaveValue(
      "Check source"
    );

    await user.click(screen.getByRole("button", { name: "Delete checklist item Check source" }));
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    expect(screen.queryByRole("textbox", { name: "Checklist item title" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete task Keep moving" }));
    expect(screen.getByRole("dialog", { name: "Delete task and its checklist?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete task" }));

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSavePlan).toHaveBeenCalledTimes(1));
    expect(onSavePlan.mock.calls[0]?.[0]).toMatchObject({
      deletedTaskIds: ["task-1"],
      confirmedTaskDeletionIds: ["task-1"],
      deletedChecklistItemIds: ["check-1"],
      confirmedChecklistItemIds: ["check-1"]
    });
  });

  it("keeps the active task in place and explains why it cannot be deleted", async () => {
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

    renderWithRouter(
      <Planner planFrames={planFrames} activeTaskId="task-1" onOpenTask={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    await user.click(screen.getByRole("button", { name: "Delete task Keep moving" }));

    expect(
      screen.getByText("Choose a new active task or clear it before deleting this task.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the task draft available when saving is rejected", async () => {
    const user = userEvent.setup();
    const onSavePlan = vi.fn().mockRejectedValue(
      new Error(
        "This task has work history, notes, Inbox items, or linked commits and can't be deleted. Complete, move, or hide it instead."
      )
    );
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
      <Planner planFrames={planFrames} onSavePlan={onSavePlan} onOpenTask={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edit plan Current work" }));
    await user.click(screen.getByRole("button", { name: "Expand task Keep moving" }));
    const taskTitle = screen.getByRole("textbox", { name: "Task title" });
    await user.clear(taskTitle);
    await user.type(taskTitle, "Move this safely");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "This task has work history, notes, Inbox items, or linked commits and can't be deleted. Complete, move, or hide it instead."
        )
      ).toBeInTheDocument()
    );
    expect(screen.getByRole("textbox", { name: "Task title" })).toHaveValue("Move this safely");
    expect(screen.getByRole("region", { name: "Editing Current work" })).toBeInTheDocument();
  });

  it("supports keyboard reordering from the stage drag handle", async () => {
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
    await user.click(screen.getByRole("button", { name: "Add stage" }));
    const newStageHandle = screen.getByRole("button", { name: "Drag stage New stage" });

    newStageHandle.focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowUp}");
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSavePlan).toHaveBeenCalledTimes(1));
    const savedDraft = onSavePlan.mock.calls[0]?.[0] as {
      stages: Array<{ id: string }>;
    };
    expect(savedDraft.stages.map((stage) => stage.id)).toEqual([
      "draft-stage-1",
      "current-plan-stage"
    ]);
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
    await user.click(
      screen.getByRole("button", { name: "Delete stage Current work stage" })
    );

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
  collapsed = false,
  checklist = []
}: {
  planId: string;
  title: string;
  isCurrent: boolean;
  taskId: string;
  taskTitle: string;
  taskStatus?: "todo" | "done";
  collapsed?: boolean;
  checklist?: Array<{
    id: string;
    title: string;
    description?: string;
    completed?: boolean;
  }>;
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
    checklist: checklist.map((item, position) => ({
      ...item,
      taskId,
      completed: item.completed ?? false,
      position
    }))
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
