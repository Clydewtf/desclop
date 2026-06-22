import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import type { GitCommit, Task } from "../../shared/domain/types";
import { TaskDetail } from "./TaskDetail";

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
    nextStep: "",
    position: 0,
    ...overrides
  };
}

function gitCommitFixture(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    sha: "abc123",
    projectId: "p1",
    branch: "main",
    message: "Fix import",
    authorName: "Clyde",
    committedAt: "2026-05-20T10:00:00Z",
    changedFiles: ["src/app/App.tsx"],
    ...overrides
  };
}

const task: Task = taskFixture({
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
});

describe("TaskDetail", () => {
  it("shows task execution controls without inline capture or expanded commit clutter", async () => {
    const user = userEvent.setup();
    const onStartFocus = vi.fn();
    const onCommitUnlink = vi.fn();
    const onCommitMove = vi.fn();

    renderWithRouter(
      <TaskDetail
        task={taskFixture({
          id: "task-1",
          title: "Review Today",
          nextStep: "Remove inline capture"
        })}
        stageTitle="UI pass"
        checklist={[]}
        notes={[]}
        linkedCommits={[
          {
            sha: "abcdef123456",
            projectId: "project-1",
            branch: "main",
            message: "fix: remove capture card",
            authorName: "Clyde",
            committedAt: "2026-06-16T08:51:07Z",
            changedFiles: ["apps/desktop/src/features/today/Today.tsx"]
          }
        ]}
        availableTasks={[taskFixture({ id: "task-2", title: "Polish Focus" })]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={vi.fn()}
        onNextStepSave={vi.fn()}
        onStartFocus={onStartFocus}
        onCommitUnlink={onCommitUnlink}
        onCommitMove={onCommitMove}
        onStartManualWorkReview={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Next action")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Quick capture" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Timebox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
    expect(screen.getByText("abcdef1 · main · 1 file changed")).toBeInTheDocument();
    expect(screen.queryByText("apps/desktop/src/features/today/Today.tsx")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show commit details" }));
    expect(screen.getByText("apps/desktop/src/features/today/Today.tsx")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove from task" }));
    expect(onCommitUnlink).toHaveBeenCalledWith("abcdef123456", "task-1");
  });

  it("renders task detail as a focused workbench", () => {
    renderWithRouter(
      <TaskDetail
        task={taskFixture({ title: "Create local store", status: "active", nextStep: "Run cargo test" })}
        stageTitle="Foundation"
        checklist={[{ id: "c1", taskId: "t1", title: "Add migration", completed: false, position: 0 }]}
        notes={[{ id: "n1", projectId: "p1", taskId: "t1", body: "Migration passes", createdAt: "2026-05-20T10:00:00Z" }]}
        linkedCommits={[gitCommitFixture({ sha: "abc123456", message: "Fix import" })]}
        availableTasks={[]}
        workEntries={[{
          id: "w1",
          projectId: "p1",
          taskId: "t1",
          source: "manual",
          startedAt: null,
          endedAt: null,
          durationSeconds: null,
          done: "Reviewed schema",
          remains: "Run backend tests",
          nextStep: "Run cargo test",
          createdAt: "2026-05-20T10:01:30Z"
        }]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={vi.fn()}
        onNextStepSave={vi.fn()}
        onStartFocus={vi.fn()}
        onCommitUnlink={vi.fn()}
        onCommitMove={vi.fn()}
        onStartManualWorkReview={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Create local store" })).toBeInTheDocument();
    expect(screen.getByText("Foundation task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
    expect(screen.getByLabelText("Task status")).toHaveValue("active");
    expect(screen.getByLabelText("Next action")).toHaveValue("Run cargo test");
    expect(screen.getByRole("heading", { name: "Checklist" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Linked commits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Work reviews" })).toBeInTheDocument();
  });

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
        availableTasks={[]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={onStatusChange}
        onChecklistToggle={onChecklistToggle}
        onNoteAdd={onNoteAdd}
        onNextStepSave={onNextStepSave}
        onStartFocus={onStartFocus}
        onCommitUnlink={vi.fn()}
        onCommitMove={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("Task status"), "active");
    await user.click(screen.getByRole("checkbox", { name: "Add migration" }));
    await user.type(screen.getByLabelText("Quick note"), "Migration is ready");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.type(screen.getByLabelText("Next action"), "Write repository tests");
    await user.click(screen.getByRole("button", { name: "Save next action" }));
    await user.clear(screen.getByLabelText("Timebox"));
    await user.click(screen.getByRole("button", { name: "Start focus" }));

    expect(onStatusChange).toHaveBeenCalledWith("t1", "active");
    expect(onChecklistToggle).toHaveBeenCalledWith("c1", true);
    expect(onNoteAdd).toHaveBeenCalledWith("t1", "Migration is ready");
    expect(onNextStepSave).toHaveBeenCalledWith("t1", "Write repository tests");
    expect(onStartFocus).toHaveBeenCalledWith({
      taskId: "t1",
      mode: "ambient",
      timeboxMinutes: null
    });
  });

  it("starts a fixed timebox focus session", async () => {
    const user = userEvent.setup();
    const onStartFocus = vi.fn();

    renderWithRouter(
      <TaskDetail
        task={task}
        checklist={[]}
        notes={[]}
        linkedCommits={[]}
        availableTasks={[]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={vi.fn()}
        onNextStepSave={vi.fn()}
        onStartFocus={onStartFocus}
        onCommitUnlink={vi.fn()}
        onCommitMove={vi.fn()}
      />
    );

    await user.clear(screen.getByLabelText("Timebox"));
    await user.type(screen.getByLabelText("Timebox"), "25.9");
    await user.click(screen.getByRole("button", { name: "Start focus" }));

    expect(onStartFocus).toHaveBeenCalledWith({
      taskId: "t1",
      mode: "timebox",
      timeboxMinutes: 25
    });
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
        availableTasks={[]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={onNoteAdd}
        onNextStepSave={vi.fn()}
        onStartFocus={vi.fn()}
        onCommitUnlink={vi.fn()}
        onCommitMove={vi.fn()}
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
      availableTasks: [],
      workEntries: [],
      inboxItems: [],
      onStatusChange: vi.fn(),
      onChecklistToggle: vi.fn(),
      onNoteAdd: vi.fn(),
      onNextStepSave: vi.fn(),
      onStartFocus: vi.fn(),
      onCommitUnlink: vi.fn(),
      onCommitMove: vi.fn()
    };
    const { rerender } = render(
      <TaskDetail task={{ ...task, nextStep: "Write tests" }} {...props} />
    );

    expect(screen.getByLabelText("Next action")).toHaveValue("Write tests");

    rerender(
      <TaskDetail
        task={{ ...task, id: "t2", title: "Wire commands", nextStep: "Run cargo test" }}
        {...props}
      />
    );

    expect(screen.getByLabelText("Next action")).toHaveValue("Run cargo test");
  });

  it("renders human-readable task status labels", () => {
    renderWithRouter(
      <TaskDetail
        task={task}
        checklist={[]}
        notes={[]}
        linkedCommits={[]}
        availableTasks={[]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={vi.fn()}
        onNextStepSave={vi.fn()}
        onStartFocus={vi.fn()}
        onCommitUnlink={vi.fn()}
        onCommitMove={vi.fn()}
      />
    );

    expect(screen.getByRole("option", { name: "To do" })).toHaveValue("todo");
    expect(screen.getByRole("option", { name: "Active" })).toHaveValue("active");
    expect(screen.getByRole("option", { name: "Blocked" })).toHaveValue("blocked");
    expect(screen.getByRole("option", { name: "Done" })).toHaveValue("done");
  });

  it("starts a manual work review without rendering inline capture", async () => {
    const user = userEvent.setup();
    const onStartManualWorkReview = vi.fn();

    renderWithRouter(
      <TaskDetail
        task={task}
        checklist={[]}
        notes={[]}
        linkedCommits={[]}
        availableTasks={[]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={vi.fn()}
        onNextStepSave={vi.fn()}
        onStartFocus={vi.fn()}
        onCommitUnlink={vi.fn()}
        onCommitMove={vi.fn()}
        onStartManualWorkReview={onStartManualWorkReview}
      />
    );

    expect(screen.queryByRole("heading", { name: "Quick capture" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add work review" }));

    expect(onStartManualWorkReview).toHaveBeenCalled();
  });

  it("renders linked commits with changed files and unlinks a commit", async () => {
    const user = userEvent.setup();
    const onCommitUnlink = vi.fn();
    const onCommitMove = vi.fn();

    renderWithRouter(
      <TaskDetail
        task={task}
        checklist={[]}
        notes={[]}
        linkedCommits={[
          gitCommitFixture({
            sha: "abc123",
            message: "Fix import",
            changedFiles: ["src/app/App.tsx"]
          })
        ]}
        availableTasks={[taskFixture({ id: "t2", title: "Other task" })]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={vi.fn()}
        onNextStepSave={vi.fn()}
        onStartFocus={vi.fn()}
        onCommitUnlink={onCommitUnlink}
        onCommitMove={onCommitMove}
      />
    );

    expect(screen.getByText("Fix import")).toBeInTheDocument();
    expect(screen.queryByText("src/app/App.tsx")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show commit details" }));
    expect(screen.getByText("src/app/App.tsx")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove from task" }));

    expect(onCommitUnlink).toHaveBeenCalledWith("abc123", "t1");
  });

  it("moves a linked commit to another task", async () => {
    const user = userEvent.setup();
    const onCommitUnlink = vi.fn();
    const onCommitMove = vi.fn();

    renderWithRouter(
      <TaskDetail
        task={task}
        checklist={[]}
        notes={[]}
        linkedCommits={[gitCommitFixture({ sha: "abc123", message: "Fix import" })]}
        availableTasks={[taskFixture({ id: "t2", title: "Other task" })]}
        workEntries={[]}
        inboxItems={[]}
        onStatusChange={vi.fn()}
        onChecklistToggle={vi.fn()}
        onNoteAdd={vi.fn()}
        onNextStepSave={vi.fn()}
        onStartFocus={vi.fn()}
        onCommitUnlink={onCommitUnlink}
        onCommitMove={onCommitMove}
      />
    );

    await user.click(screen.getByRole("button", { name: "Show commit details" }));
    await user.selectOptions(screen.getByLabelText("Move abc123 to task"), "t2");
    await user.click(screen.getByRole("button", { name: "Move to task" }));

    expect(onCommitMove).toHaveBeenCalledWith("abc123", "t1", "t2");
  });
});
