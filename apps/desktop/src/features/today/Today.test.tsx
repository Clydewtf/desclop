import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import type { Task } from "../../shared/domain/types";
import { Today } from "./Today";

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    projectId: "p1",
    stageId: "s1",
    title: "Create local store",
    description: "",
    status: "todo",
    priority: null,
    dueDate: null,
    nextStep: "Run repository tests",
    position: 0,
    ...overrides
  };
}

describe("Today", () => {
  it("focuses Today on next action, recent context, and clickable nearby tasks", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    const onOpenTask = vi.fn();

    renderWithRouter(
      <Today
        view={{
          state: "missing-next-step",
          heading: "Continue Review Today",
          stageTitle: "UI pass",
          primaryTaskTitle: "Review Today",
          primaryActionLabel: "Add next action",
          nextStep: "No next action yet.",
          latestNote: "",
          facts: ["5 commits on main since your last review"],
          nextTasks: [
            {
              id: "task-2",
              projectId: "project-1",
              stageId: "stage-1",
              title: "Polish Focus",
              description: "",
              status: "todo",
              priority: null,
              dueDate: null,
              nextStep: "Remove inline capture",
              position: 1
            }
          ]
        }}
        onPrimaryAction={onPrimaryAction}
        onOpenTask={onOpenTask}
      />
    );

    expect(screen.queryByRole("heading", { name: "Quick capture" })).not.toBeInTheDocument();
    expect(screen.getByText("Next action needed")).toBeInTheDocument();
    expect(screen.getByText("Add the next action before continuing")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Add the next action before continuing Write one small action so you can resume this task without rereading everything."
    );
    expect(screen.getByText("Recent context")).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Polish Focus" }));

    expect(onOpenTask).toHaveBeenCalledWith("task-2");
  });

  it("shows current task, recent context, and nearby tasks", () => {
    renderWithRouter(
      <Today
        view={{
          state: "ready",
          heading: "Continue where you left off",
          primaryTaskTitle: "Create local store",
          stageTitle: "Foundation",
          latestNote: "Migration passes",
          nextStep: "Run repository tests",
          facts: ["1 recent commit on main", "2 open inbox captures"],
          nextTasks: [taskFixture({ id: "t2", title: "Wire commands", nextStep: "Add invoke wrappers" })],
          primaryActionLabel: "Continue task"
        }}
        onPrimaryAction={vi.fn()}
        onStartManualWorkReview={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Continue where you left off" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create local store" })).toBeInTheDocument();
    expect(screen.getByText("Run repository tests")).toBeInTheDocument();
    expect(screen.getByText("1 recent commit on main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Up next" })).toBeInTheDocument();
    expect(screen.getByText("Wire commands")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue task" })).toBeEnabled();
  });

  it("renders no-plan empty state with import action", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();

    renderWithRouter(
      <Today
        view={{
          state: "no-plan",
          heading: "Set up Today",
          primaryTaskTitle: "No plan imported",
          stageTitle: "Project setup",
          latestNote: "",
          nextStep: "Import a Markdown plan to start using Today.",
          facts: [],
          nextTasks: [],
          primaryActionLabel: "Import a plan"
        }}
        onPrimaryAction={onPrimaryAction}
      />
    );

    const emptyState = screen.getByRole("article", { name: "Plan required" });
    expect(
      within(emptyState).getByRole("heading", { name: "No plan imported", level: 2 })
    ).toBeInTheDocument();
    expect(
      within(emptyState).getByText("Import a Markdown plan to start using Today.")
    ).toBeInTheDocument();

    await user.click(within(emptyState).getByRole("button", { name: "Import a plan" }));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it("starts manual work review", async () => {
    const user = userEvent.setup();
    const onStartManualWorkReview = vi.fn();

    renderWithRouter(
      <Today
        view={{
          state: "ready",
          heading: "Continue where you left off",
          primaryTaskTitle: "Create local store",
          stageTitle: "Foundation",
          latestNote: "",
          nextStep: "Run repository tests",
          facts: [],
          nextTasks: [],
          primaryActionLabel: "Continue task"
        }}
        onPrimaryAction={vi.fn()}
        onStartManualWorkReview={onStartManualWorkReview}
      />
    );

    expect(screen.getByText("No recent context yet.")).toBeInTheDocument();
    expect(screen.getByText("No nearby tasks.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Open / })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add manual work review" }));

    expect(onStartManualWorkReview).toHaveBeenCalled();
  });
});
