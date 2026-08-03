import { expect, test } from "@playwright/test";

type ContextSmokeWindow = Window & {
  __CONTEXT_SMOKE_CALLS__: string[];
  __CONTEXT_SMOKE_COPY__: string | null;
};

test("manual AI context export previews, edits, excludes, and copies local fields", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
      id: "project-1",
      name: "Context smoke project",
      localPath: "/tmp/private/context-project",
      gitEnabled: false,
      gitRemote: null,
      activeTaskId: "task-1",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z"
    };
    const plan = {
      plans: [{ id: "plan-1", projectId: project.id, title: "Context plan", position: 0 }],
      stages: [
        {
          id: "stage-1",
          projectId: project.id,
          planId: "plan-1",
          title: "Context stage",
          description: "The stage description",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "task-1",
          projectId: project.id,
          stageId: "stage-1",
          title: "Review context",
          description: "The task description",
          status: "active",
          priority: "high",
          dueDate: "2026-07-31",
          nextStep: "Review the exported prompt",
          position: 0
        }
      ],
      checklistItems: [
        {
          id: "check-1",
          taskId: "task-1",
          title: "Check every field",
          completed: true,
          position: 0
        }
      ]
    };
    const calls: string[] = [];

    (window as ContextSmokeWindow).__CONTEXT_SMOKE_CALLS__ = calls;
    (window as ContextSmokeWindow).__CONTEXT_SMOKE_COPY__ = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as ContextSmokeWindow).__CONTEXT_SMOKE_COPY__ = value;
        }
      }
    });
    window.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        calls.push(command);

        if (command === "get_database_status") {
          return {
            state: "ready",
            schemaVersion: 3,
            targetSchemaVersion: 3,
            integrity: "ok",
            recoveryCode: null,
            recoveryBackupPath: null,
            nextStep: null
          };
        }
        if (command === "list_projects") {
          return [project];
        }
        if (command === "list_project_summaries") {
          return [];
        }
        if (command === "get_resume_brief") {
          return {
            id: `resume-${args.projectId}`,
            projectId: project.id,
            taskId: "task-1",
            stageId: "stage-1",
            latestNote: "",
            nextStep: "Review the exported prompt",
            facts: [],
            generatedAt: "2026-07-26T00:00:00.000Z"
          };
        }
        if (command === "load_project_plan") {
          return plan;
        }
        if (command === "get_project_diagnostics") {
          return {
            appVersion: "0.2.0-beta.2",
            projectPath: project.localPath,
            folderState: "available",
            git: { configured: false, repositoryDetected: false },
            database: {
              state: "ready",
              schemaVersion: 3,
              targetSchemaVersion: 3,
              integrity: "ok"
            },
            lastBackup: {
              state: "none",
              kind: null,
              createdAt: null,
              formatVersion: null,
              schemaVersion: null
            },
            relinkAvailable: true,
            supportReport: {
              diagnosticFormatVersion: 1,
              appVersion: "0.2.0-beta.2",
              folderState: "available",
              git: { configured: false, repositoryDetected: false },
              database: {
                state: "ready",
                schemaVersion: 3,
                targetSchemaVersion: 3,
                integrity: "ok"
              },
              lastBackup: {
                state: "none",
                kind: null,
                createdAt: null,
                formatVersion: null,
                schemaVersion: null
              },
              relinkAvailable: true
            }
          };
        }
        if (command === "list_notes_for_task") {
          return [
            {
              id: "note-1",
              taskId: "task-1",
              body: "Keep the context concise.",
              createdAt: "2026-07-26T03:00:00.000Z",
              updatedAt: "2026-07-26T03:00:00.000Z"
            }
          ];
        }
        if (command === "list_work_entries_for_task") {
          return [
            {
              id: "work-1",
              taskId: "task-1",
              source: "manual",
              done: "Previewed the fields",
              remains: "Copy after review",
              nextStep: "Review the exported prompt",
              createdAt: "2026-07-26T04:00:00.000Z"
            }
          ];
        }

        return null;
      }
    };
  });

  await page.goto("/");
  await page.getByRole("dialog", { name: "First-run help" }).getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Backups", exact: true }).click();

  const contextExport = page.locator("details.context-export");
  await expect(contextExport).not.toHaveAttribute("open");
  await page.getByText("Manual AI context export", { exact: true }).click();

  for (const title of [
    "Project",
    "Plan",
    "Task",
    "Next action",
    "Recent work reviews",
    "Notes",
    "Related commits"
  ]) {
    await expect(page.getByLabel(`${title} preview`)).toBeVisible();
  }

  const notesCheckbox = page.getByRole("checkbox", { name: "Include Notes" });
  await expect(notesCheckbox).toBeChecked();
  expect(await page.evaluate(() => (window as ContextSmokeWindow).__CONTEXT_SMOKE_COPY__)).toBeNull();

  await notesCheckbox.uncheck();
  await page.getByLabel("Next action preview").fill("Edited next action");

  const preview = await page.getByLabel("Full Markdown preview").inputValue();
  expect(preview).toContain("Edited next action");
  expect(preview).not.toContain("## Notes");
  expect(preview).not.toContain("/tmp/private/context-project");

  await page.getByRole("button", { name: "Copy" }).click();
  await expect.poll(() => page.evaluate(() => (window as ContextSmokeWindow).__CONTEXT_SMOKE_COPY__)).toBe(preview);

  const calls = await page.evaluate(() => (window as ContextSmokeWindow).__CONTEXT_SMOKE_CALLS__);
  expect(calls.some((command) => /ai|summary|send|upload/i.test(command))).toBe(false);
});
