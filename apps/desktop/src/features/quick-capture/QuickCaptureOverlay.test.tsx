import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function QuickCaptureHarness({
  onSave,
  onClose = vi.fn()
}: {
  onSave: (input: {
    body: string;
    kind: "untyped" | "bug" | "idea" | "question" | "note" | "task_candidate";
    taskId: string | null;
  }) => void | Promise<void>;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open capture
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Force close
      </button>
      <QuickCaptureOverlay
        open={open}
        tasks={tasks}
        defaultTaskId="task-active"
        onSave={onSave}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    </>
  );
}

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

  it("renders dialog semantics and contains keyboard focus", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <QuickCaptureOverlay
        open
        tasks={tasks}
        defaultTaskId="task-active"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const capture = screen.getByLabelText("Capture");
    await waitFor(() => expect(capture).toHaveFocus());

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    expect(capture).toHaveFocus();
  });

  it("renders nothing while closed and restores opener focus after close", async () => {
    const user = userEvent.setup();

    renderWithRouter(<QuickCaptureHarness onSave={vi.fn()} />);

    const opener = screen.getByRole("button", { name: "Open capture" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(opener);
    await waitFor(() => expect(screen.getByLabelText("Capture")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
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

  it("trims the draft and saves with Ctrl+Enter", async () => {
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

    expect(screen.getByRole("option", { name: "Note" })).toHaveValue("note");
    expect(screen.getByRole("option", { name: "Bug" })).toHaveValue("bug");
    expect(screen.getByRole("option", { name: "Question" })).toHaveValue("question");
    expect(screen.getByRole("option", { name: "Follow-up" })).toHaveValue("task_candidate");
    expect(screen.getByRole("option", { name: "Untyped" })).toHaveValue("untyped");

    await user.selectOptions(screen.getByLabelText("Type"), "question");
    await user.type(screen.getByLabelText("Capture"), "  Check keyboard save  ");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onSave).toHaveBeenCalledWith({
      body: "Check keyboard save",
      kind: "question",
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

  it("shows the exact error and retains the draft when saving fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("database unavailable"));

    renderWithRouter(
      <QuickCaptureOverlay
        open
        tasks={tasks}
        defaultTaskId="task-active"
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("Capture"), "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Save capture" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save capture.");
    expect(screen.getByLabelText("Capture")).toHaveValue("Keep this draft");
    expect(screen.getByRole("button", { name: "Save capture" })).toBeEnabled();
  });

  it("ignores duplicate submissions while a save is pending", async () => {
    const user = userEvent.setup();
    const pendingSave = deferred<void>();
    const onSave = vi.fn().mockReturnValue(pendingSave.promise);

    renderWithRouter(
      <QuickCaptureOverlay
        open
        tasks={tasks}
        defaultTaskId="task-active"
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("Capture"), "Save once");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving capture" })).toBeDisabled();

    await act(async () => pendingSave.resolve());
  });

  it("makes a stale save harmless after close and reopen", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    const onSave = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const onClose = vi.fn();

    renderWithRouter(<QuickCaptureHarness onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Open capture" }));
    await user.type(screen.getByLabelText("Capture"), "Session A");
    await user.click(screen.getByRole("button", { name: "Save capture" }));

    await user.click(screen.getByRole("button", { name: "Force close" }));
    await user.click(screen.getByRole("button", { name: "Open capture" }));
    await user.type(screen.getByLabelText("Capture"), "Session B");
    await user.click(screen.getByRole("button", { name: "Save capture" }));

    expect(onSave).toHaveBeenCalledTimes(2);

    await act(async () => firstSave.reject(new Error("stale failure")));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Capture")).toHaveValue("Session B");
    expect(screen.getByRole("button", { name: "Saving capture" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => secondSave.resolve());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
