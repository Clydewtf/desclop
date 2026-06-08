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
  it("shows current task, resume facts, quick capture, and next-up tasks", () => {
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
        onCaptureInbox={vi.fn()}
        onStartManualWorkReview={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Continue where you left off" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create local store" })).toBeInTheDocument();
    expect(screen.getByText("Run repository tests")).toBeInTheDocument();
    expect(screen.getByText("1 recent commit on main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next up" })).toBeInTheDocument();
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

  it("renders inbox capture and starts manual work review", async () => {
    const user = userEvent.setup();
    const onCaptureInbox = vi.fn().mockResolvedValue(undefined);
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
        onCaptureInbox={onCaptureInbox}
        onStartManualWorkReview={onStartManualWorkReview}
      />
    );

    await user.type(screen.getByLabelText("Capture"), "Check export shape");
    await user.selectOptions(screen.getByLabelText("Capture type"), "question");
    await user.click(screen.getByRole("button", { name: "Capture" }));
    await user.click(screen.getByRole("button", { name: "Add manual work review" }));

    expect(onCaptureInbox).toHaveBeenCalledWith({
      body: "Check export shape",
      kind: "question"
    });
    expect(onStartManualWorkReview).toHaveBeenCalled();
  });
});
