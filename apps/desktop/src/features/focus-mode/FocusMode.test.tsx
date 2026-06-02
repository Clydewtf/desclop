import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import type { ChecklistItem, Task } from "../../shared/domain/types";
import { FocusMode } from "./FocusMode";

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    projectId: "p1",
    stageId: "s1",
    title: "Create local store",
    description: "",
    status: "active",
    priority: null,
    dueDate: null,
    nextStep: "",
    position: 0,
    ...overrides
  };
}

function checklistFixture(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: "c1",
    taskId: "t1",
    title: "Add migration",
    completed: false,
    position: 0,
    ...overrides
  };
}

describe("FocusMode", () => {
  it("shows task, checklist, quick note, inbox capture, and finish control", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const onCaptureInbox = vi.fn();
    const onNoteAdd = vi.fn();

    renderWithRouter(
      <FocusMode
        task={{ id: "t1", projectId: "p1", stageId: "s1", title: "Create local store", description: "", status: "active", priority: null, dueDate: null, nextStep: "", position: 0 }}
        checklist={[{ id: "c1", taskId: "t1", title: "Add migration", completed: false, position: 0 }]}
        mode="ambient"
        startedAtMs={0}
        nowMs={60000}
        timeboxMinutes={null}
        onFinish={onFinish}
        onCaptureInbox={onCaptureInbox}
        onNoteAdd={onNoteAdd}
        onChecklistToggle={vi.fn()}
      />
    );

    expect(screen.getByText("Create local store")).toBeInTheDocument();
    expect(screen.getByText("01:00")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Add migration" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quick note")).toBeInTheDocument();
    expect(screen.getByLabelText("Capture")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish focus session" }));

    expect(onFinish).toHaveBeenCalledWith({ elapsedSeconds: 60 });
  });

  it("saves a quick note before finishing focus", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const onNoteAdd = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <FocusMode
        task={{ id: "t1", projectId: "p1", stageId: "s1", title: "Create local store", description: "", status: "active", priority: null, dueDate: null, nextStep: "", position: 0 }}
        checklist={[]}
        mode="ambient"
        startedAtMs={0}
        nowMs={60000}
        timeboxMinutes={null}
        onFinish={onFinish}
        onCaptureInbox={vi.fn()}
        onNoteAdd={onNoteAdd}
        onChecklistToggle={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("Quick note"), "Keep this focus note");
    await user.click(screen.getByRole("button", { name: "Finish focus session" }));

    expect(onNoteAdd).toHaveBeenCalledWith("Keep this focus note");
    expect(onFinish).toHaveBeenCalledWith({ elapsedSeconds: 60 });
  });

  it("captures inbox items during focus", async () => {
    const user = userEvent.setup();
    const onCaptureInbox = vi.fn();

    renderWithRouter(
      <FocusMode
        task={{ id: "t1", projectId: "p1", stageId: "s1", title: "Create local store", description: "", status: "active", priority: null, dueDate: null, nextStep: "", position: 0 }}
        checklist={[]}
        mode="timebox"
        startedAtMs={0}
        nowMs={60000}
        timeboxMinutes={5}
        onFinish={vi.fn()}
        onCaptureInbox={onCaptureInbox}
        onNoteAdd={vi.fn()}
        onChecklistToggle={vi.fn()}
      />
    );

    expect(screen.getByText("04:00 remaining")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Capture"), "Remember repository tests");
    await user.selectOptions(screen.getByLabelText("Capture type"), "note");
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(onCaptureInbox).toHaveBeenCalledWith({
      body: "Remember repository tests",
      kind: "note"
    });
  });

  it("persists checklist toggles during focus mode", async () => {
    const user = userEvent.setup();
    const onChecklistToggle = vi.fn();

    renderWithRouter(
      <FocusMode
        task={taskFixture({ id: "t1" })}
        checklist={[checklistFixture({ id: "c1", title: "Add migration", completed: false })]}
        mode="ambient"
        startedAtMs={Date.parse("2026-05-20T10:00:00Z")}
        nowMs={Date.parse("2026-05-20T10:00:05Z")}
        timeboxMinutes={null}
        onFinish={vi.fn()}
        onCaptureInbox={vi.fn()}
        onNoteAdd={vi.fn()}
        onChecklistToggle={onChecklistToggle}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Add migration" }));

    expect(onChecklistToggle).toHaveBeenCalledWith("c1", true);
  });
});
