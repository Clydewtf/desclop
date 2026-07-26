import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { ContextExport, type ContextExportProps } from "./contextExportView";

function renderContextExport(overrides: Partial<ContextExportProps> = {}) {
  const projectId = "p1";
  const planId = "plan-1";
  const stageId = "stage-1";
  const taskId = "task-1";
  const props: ContextExportProps = {
    project: {
      id: projectId,
      name: "Desclop",
      localPath: "/tmp/desclop",
      gitEnabled: true,
      gitRemote: null,
      activeTaskId: taskId,
      createdAt: "2026-07-20T00:00:00Z",
      updatedAt: "2026-07-26T00:00:00Z"
    },
    plans: [{ id: planId, projectId, title: "Build beta", position: 0 }],
    stages: [
      {
        id: stageId,
        projectId,
        planId,
        title: "Context export",
        description: "Keep the handoff local.",
        position: 0,
        status: "current"
      }
    ],
    tasks: [
      {
        id: taskId,
        projectId,
        stageId,
        title: "Copy a reviewed context",
        description: "Prepare a prompt.",
        status: "active",
        priority: "normal",
        dueDate: null,
        nextStep: "Run the focused tests.",
        position: 0
      }
    ],
    checklistItems: [],
    workEntries: [
      {
        id: "work-1",
        projectId,
        taskId,
        source: "manual",
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        done: "Added the preview.",
        remains: "Check copying.",
        nextStep: "Run tests.",
        createdAt: "2026-07-26T00:00:00Z"
      }
    ],
    notes: [
      {
        id: "note-1",
        projectId,
        taskId,
        body: "Keep this note in the local preview.",
        createdAt: "2026-07-25T00:00:00Z"
      }
    ],
    linkedCommits: [],
    selectedPlanId: planId,
    selectedTaskId: taskId,
    loading: false,
    error: null,
    onPlanChange: vi.fn(),
    onTaskChange: vi.fn(),
    onRefresh: vi.fn(),
    onCopy: vi.fn(),
    ...overrides
  };

  renderWithRouter(<ContextExport {...props} />);
  return props;
}

describe("ContextExport", () => {
  it("shows every field preview and copies the edited, selected result", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    renderContextExport({ onCopy });

    const disclosure = screen.getByText("Manual AI context export").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    await user.click(screen.getByText("Manual AI context export"));

    expect(screen.getByLabelText("Project preview")).toHaveValue("Name: Desclop");
    expect(screen.getByLabelText("Plan preview")).toHaveValue(
      "Plan: Build beta\nStage: Context export\nStage context:\nKeep the handoff local."
    );
    expect(screen.getByLabelText("Task preview")).toHaveValue(
      "Title: Copy a reviewed context\nStatus: active\nPriority: normal\nDue date: Not set\nDescription:\nPrepare a prompt.\nChecklist:\nNo checklist items."
    );
    expect(screen.getByLabelText("Next action preview")).toHaveValue(
      "Run the focused tests."
    );
    expect(screen.getByLabelText("Recent work reviews preview")).toHaveValue(
      "### 2026-07-26 · manual\n- Done: Added the preview.\n- Remains: Check copying.\n- Next action: Run tests."
    );
    expect(screen.getByLabelText("Notes preview")).toHaveValue(
      "- 2026-07-25: Keep this note in the local preview."
    );
    expect(screen.getByLabelText("Related commits preview")).toHaveValue(
      "No related commits recorded."
    );

    await user.click(screen.getByRole("checkbox", { name: "Include Notes" }));
    await user.clear(screen.getByLabelText("Next action preview"));
    await user.type(screen.getByLabelText("Next action preview"), "Use the edited action.");

    const combinedPreview = screen.getByLabelText("Full Markdown preview") as HTMLTextAreaElement;
    expect(combinedPreview.value).toContain("Use the edited action.");
    expect(combinedPreview.value).not.toContain("## Notes");
    expect(combinedPreview.value).not.toContain("Keep this note");

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith(combinedPreview.value);
  });

  it("keeps the copy action manual and exposes a refresh callback only", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onCopy = vi.fn();
    renderContextExport({ onRefresh, onCopy });

    await user.click(screen.getByText("Manual AI context export"));

    await user.click(screen.getByRole("button", { name: "Refresh local context" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onCopy).not.toHaveBeenCalled();
  });
});
