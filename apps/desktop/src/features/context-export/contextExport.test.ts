import { describe, expect, it } from "vitest";
import type { ContextExportInput } from "./contextExport";
import {
  buildContextExportFields,
  composeContextExport,
  CONTEXT_EXPORT_FIELD_IDS,
  CONTEXT_EXPORT_WORK_REVIEW_LIMIT
} from "./contextExport";

function contextInput(overrides: Partial<ContextExportInput> = {}): ContextExportInput {
  const projectId = "p1";
  const planId = "plan-1";
  const stageId = "stage-1";
  const taskId = "task-1";

  return {
    project: {
      id: projectId,
      name: "Desclop",
      localPath: "/tmp/desclop",
      gitEnabled: true,
      gitRemote: "git@example.com:desclop.git",
      activeTaskId: taskId,
      createdAt: "2026-07-20T00:00:00Z",
      updatedAt: "2026-07-26T00:00:00Z"
    },
    plan: {
      id: planId,
      projectId,
      title: "Build beta",
      position: 0
    },
    stage: {
      id: stageId,
      projectId,
      planId,
      title: "Context export",
      description: "Keep the handoff local.",
      position: 0,
      status: "current"
    },
    task: {
      id: taskId,
      projectId,
      stageId,
      title: "Copy a reviewed context",
      description: "Prepare a prompt without hidden data.",
      status: "active",
      priority: "high",
      dueDate: "2026-07-30",
      nextStep: "Run the focused tests.",
      position: 0
    },
    checklistItems: [
      {
        id: "check-1",
        taskId,
        title: "Inspect the full preview",
        description: "Check the final Markdown before copying.",
        completed: true,
        position: 0
      }
    ],
    workEntries: [
      {
        id: "work-old",
        projectId,
        taskId,
        source: "manual",
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        done: "Older review",
        remains: "",
        nextStep: "",
        createdAt: "2026-07-01T00:00:00Z"
      },
      ...Array.from({ length: CONTEXT_EXPORT_WORK_REVIEW_LIMIT }, (_, index) => ({
        id: `work-${index}`,
        projectId,
        taskId,
        source: "manual" as const,
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        done: `Review ${index}`,
        remains: "Keep it local.",
        nextStep: "Continue.",
        createdAt: `2026-07-${String(20 + index).padStart(2, "0")}T00:00:00Z`
      }))
    ],
    notes: [
      {
        id: "note-1",
        projectId,
        taskId,
        body: "The preview is the source of truth.",
        createdAt: "2026-07-25T00:00:00Z"
      }
    ],
    linkedCommits: [
      {
        sha: "abc1234",
        projectId,
        branch: "main",
        message: "feat: add context export",
        authorName: "Clyde",
        committedAt: "2026-07-26T00:00:00Z",
        changedFiles: ["contextExport.ts"]
      }
    ],
    ...overrides
  };
}

describe("context export contract", () => {
  it("builds every field in the fixed order and includes the latest reviews only", () => {
    const fields = buildContextExportFields(contextInput());

    expect(fields.map((field) => field.id)).toEqual([...CONTEXT_EXPORT_FIELD_IDS]);
    expect(fields.every((field) => field.defaultIncluded)).toBe(true);
    expect(fields[0]?.preview).toBe("Name: Desclop");
    expect(fields[1]?.preview).toContain("Plan: Build beta");
    expect(fields[2]?.preview).toContain("- [x] Inspect the full preview");
    expect(fields[3]?.preview).toBe("Run the focused tests.");
    expect(fields[4]?.preview).toContain("Review 4");
    expect(fields[4]?.preview).not.toContain("Older review");
    expect(fields[4]?.preview).toContain("Showing 5 latest of 6 work reviews.");
    expect(fields[5]?.preview).toContain("The preview is the source of truth.");
    expect(fields[6]?.preview).toContain("feat: add context export");
  });

  it("marks empty fields as visible but excluded by default", () => {
    const fields = buildContextExportFields(
      contextInput({
        plan: null,
        stage: null,
        task: null,
        workEntries: [],
        notes: [],
        linkedCommits: []
      })
    );

    expect(fields.map((field) => field.defaultIncluded)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false
    ]);
    expect(fields.find((field) => field.id === "notes")?.preview).toBe("No notes recorded.");

    const emptyNextActionInput = contextInput();
    emptyNextActionInput.task = emptyNextActionInput.task
      ? { ...emptyNextActionInput.task, nextStep: "" }
      : null;
    expect(
      buildContextExportFields(emptyNextActionInput).find((field) => field.id === "next_action")
        ?.defaultIncluded
    ).toBe(false);
  });

  it("composes only included fields and preserves an edited field", () => {
    const fields = buildContextExportFields(contextInput());
    const composed = composeContextExport(
      fields.map((field) => ({
        title: field.title,
        preview: field.id === "next_action" ? "Use the edited action." : field.preview,
        included: field.id !== "notes"
      }))
    );

    expect(composed).toContain("# Desclop AI context");
    expect(composed).toContain("Use the edited action.");
    expect(composed).not.toContain("## Notes");
    expect(composed.indexOf("## Project")).toBeLessThan(composed.indexOf("## Task"));
    expect(composed.indexOf("## Task")).toBeLessThan(composed.indexOf("## Next action"));
  });
});
