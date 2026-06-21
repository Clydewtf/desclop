import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import type { Task } from "../../shared/domain/types";
import { QuickCaptureOverlay } from "./QuickCaptureOverlay";

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-active",
    projectId: "project-1",
    stageId: "stage-1",
    title: "Review Today",
    description: "",
    status: "active",
    priority: null,
    dueDate: null,
    nextStep: "Review the current plan",
    position: 0,
    ...overrides
  };
}

const tasks = [
  taskFixture(),
  taskFixture({
    id: "task-todo",
    title: "Polish Focus",
    status: "todo",
    nextStep: "Tighten the focus layout",
    position: 1
  })
];

describe("QuickCaptureOverlay", () => {
  it("uses the planned presentation and dialog structure classes", () => {
    const { container } = renderWithRouter(
      <QuickCaptureOverlay
        open
        tasks={tasks}
        defaultTaskId="task-active"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(container.querySelector(".quick-capture-overlay")).toHaveAttribute(
      "role",
      "presentation"
    );
    expect(container.querySelector("header")).toHaveClass("quick-capture-dialog__header");
    expect(container.querySelector(".quick-capture-dialog__meta")).toBeInTheDocument();
    expect(container.querySelector(".quick-capture-dialog__actions")).toBeInTheDocument();
  });

  it("focuses Capture and saves the default task with Meta+Enter", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <QuickCaptureOverlay
        open
        tasks={tasks}
        defaultTaskId="task-active"
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    const capture = screen.getByLabelText("Capture");
    await waitFor(() => expect(capture).toHaveFocus());

    await user.type(capture, "Record the review decision");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(onSave).toHaveBeenCalledWith({
      body: "Record the review decision",
      kind: "note",
      taskId: "task-active"
    });
  });

  it("saves an Inbox capture without a related task", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <QuickCaptureOverlay
        open
        tasks={tasks}
        defaultTaskId="task-active"
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("Related to"), "__inbox__");
    await user.type(screen.getByLabelText("Capture"), "Investigate the import warning");
    await user.click(screen.getByRole("button", { name: "Save capture" }));

    expect(onSave).toHaveBeenCalledWith({
      body: "Investigate the import warning",
      kind: "note",
      taskId: null
    });
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithRouter(
      <QuickCaptureOverlay
        open
        tasks={tasks}
        defaultTaskId="task-active"
        onSave={vi.fn()}
        onClose={onClose}
      />
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
