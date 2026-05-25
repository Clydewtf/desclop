import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import type { Task } from "../../shared/domain/types";
import { TaskDetail } from "./TaskDetail";

const task: Task = {
  id: "t1",
  projectId: "p1",
  stageId: "s1",
  title: "Create local store",
  description: "",
  status: "todo",
  priority: null,
  dueDate: null,
  nextStep: "",
  position: 0
};

describe("TaskDetail", () => {
  it("updates status, checklist, notes, and next step", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const onChecklistToggle = vi.fn();
    const onNoteAdd = vi.fn();
    const onNextStepSave = vi.fn();
    const onStartFocus = vi.fn();

    renderWithRouter(
      <TaskDetail
        task={task}
        checklist={[{ id: "c1", taskId: "t1", title: "Add migration", completed: false, position: 0 }]}
        notes={[]}
        linkedCommits={[]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={onStatusChange}
        onChecklistToggle={onChecklistToggle}
        onNoteAdd={onNoteAdd}
        onNextStepSave={onNextStepSave}
        onStartFocus={onStartFocus}
      />
    );

    await user.selectOptions(screen.getByLabelText("Task status"), "active");
    await user.click(screen.getByRole("checkbox", { name: "Add migration" }));
    await user.type(screen.getByLabelText("Quick note"), "Migration is ready");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.type(screen.getByLabelText("Next step"), "Write repository tests");
    await user.click(screen.getByRole("button", { name: "Save next step" }));
    await user.click(screen.getByRole("button", { name: "Start Focus Mode" }));

    expect(onStatusChange).toHaveBeenCalledWith("t1", "active");
    expect(onChecklistToggle).toHaveBeenCalledWith("c1", true);
    expect(onNoteAdd).toHaveBeenCalledWith("t1", "Migration is ready");
    expect(onNextStepSave).toHaveBeenCalledWith("t1", "Write repository tests");
    expect(onStartFocus).toHaveBeenCalledWith("t1");
  });

  it("keeps note text until async note add succeeds", async () => {
    const user = userEvent.setup();
    let resolveNoteAdd: () => void = () => {};
    const onNoteAdd = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNoteAdd = resolve;
        })
    );

    renderWithRouter(
      <TaskDetail
        task={task}
        checklist={[]}
        notes={[]}
        linkedCommits={[]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={onNoteAdd}
        onNextStepSave={vi.fn()}
        onStartFocus={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("Quick note"), "Migration is ready");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(screen.getByLabelText("Quick note")).toHaveValue("Migration is ready");

    resolveNoteAdd();
    await screen.findByDisplayValue("");
  });

  it("syncs next step input when the task changes", () => {
    const props = {
      checklist: [],
      notes: [],
      linkedCommits: [],
      workEntries: [],
      inboxItems: [],
      onStatusChange: vi.fn(),
      onChecklistToggle: vi.fn(),
      onNoteAdd: vi.fn(),
      onNextStepSave: vi.fn(),
      onStartFocus: vi.fn()
    };
    const { rerender } = render(
      <TaskDetail task={{ ...task, nextStep: "Write tests" }} {...props} />
    );

    expect(screen.getByLabelText("Next step")).toHaveValue("Write tests");

    rerender(
      <TaskDetail
        task={{ ...task, id: "t2", title: "Wire commands", nextStep: "Run cargo test" }}
        {...props}
      />
    );

    expect(screen.getByLabelText("Next step")).toHaveValue("Run cargo test");
  });

  it("renders human-readable task status labels", () => {
    renderWithRouter(
      <TaskDetail
        task={task}
        checklist={[]}
        notes={[]}
        linkedCommits={[]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={vi.fn()}
        onNextStepSave={vi.fn()}
        onStartFocus={vi.fn()}
      />
    );

    expect(screen.getByRole("option", { name: "To do" })).toHaveValue("todo");
    expect(screen.getByRole("option", { name: "Active" })).toHaveValue("active");
    expect(screen.getByRole("option", { name: "Blocked" })).toHaveValue("blocked");
    expect(screen.getByRole("option", { name: "Done" })).toHaveValue("done");
  });
});
