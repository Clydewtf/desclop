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
  it("shows focused task controls without inline capture", async () => {
    const user = userEvent.setup();
    const onNoteAdd = vi.fn().mockResolvedValue(undefined);
    const onFinish = vi.fn();

    renderWithRouter(
      <FocusMode
        task={taskFixture({ id: "task-1", title: "Review Today", nextStep: "Remove inline capture" })}
        checklist={[{ id: "check-1", taskId: "task-1", title: "Update test", completed: false, position: 0 }]}
        mode="timebox"
        startedAtMs={Date.parse("2026-06-16T10:00:00Z")}
        nowMs={Date.parse("2026-06-16T10:05:00Z")}
        timeboxMinutes={25}
        onFinish={onFinish}
        onNoteAdd={onNoteAdd}
        onChecklistToggle={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Review Today" })).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.queryByLabelText("Capture")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.type(screen.getByLabelText("Task note"), "Found commit clutter");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(onNoteAdd).toHaveBeenCalledWith("Found commit clutter");

    await user.click(screen.getByRole("button", { name: "Finish session" }));
    expect(onFinish).toHaveBeenCalledWith({ elapsedSeconds: 300 });
  });

  it("keeps the note composer open and shows an error when saving fails", async () => {
    const user = userEvent.setup();
    const onNoteAdd = vi.fn().mockRejectedValue(new Error("save failed"));

    renderWithRouter(
      <FocusMode
        task={taskFixture()}
        checklist={[]}
        mode="ambient"
        startedAtMs={0}
        nowMs={60_000}
        timeboxMinutes={null}
        onFinish={vi.fn()}
        onNoteAdd={onNoteAdd}
        onChecklistToggle={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add note" }));
    await user.type(screen.getByLabelText("Task note"), "Keep this focus note");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(onNoteAdd).toHaveBeenCalledWith("Keep this focus note");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save task note.");
    expect(screen.getByLabelText("Task note")).toHaveValue("Keep this focus note");
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
        onNoteAdd={vi.fn()}
        onChecklistToggle={onChecklistToggle}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Add migration" }));

    expect(onChecklistToggle).toHaveBeenCalledWith("c1", true);
  });
});
