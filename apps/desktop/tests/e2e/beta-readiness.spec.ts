import { expect, test } from "@playwright/test";

type BetaSmokeCall = { command: string; args: Record<string, unknown> };
type BetaSmokeWindow = Window & { __BETA_SMOKE_CALLS__: BetaSmokeCall[] };

test("beta readiness smoke covers diagnostics, backup restore, and close behavior controls", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
      id: "project-1",
      name: "Beta smoke project",
      localPath: "/tmp/beta-private/project",
      gitEnabled: false,
      gitRemote: null,
      activeTaskId: "task-1",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z"
    };
    const restoredProject = {
      ...project,
      id: "project-2",
      name: "Restored beta smoke project",
      localPath: "/tmp/beta-restored-project"
    };
    let dialogCall = 0;
    let restored = false;
    const calls: BetaSmokeCall[] = [];

    const plan = {
      plans: [{ id: "plan-1", projectId: project.id, title: "Beta plan", position: 0 }],
      stages: [
        {
          id: "stage-1",
          projectId: project.id,
          planId: "plan-1",
          title: "Release confidence",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "task-1",
          projectId: project.id,
          stageId: "stage-1",
          title: "Run beta smoke",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run the platform checklist",
          position: 0
        }
      ],
      checklistItems: []
    };

    const databaseStatus = {
      state: "ready",
      schemaVersion: 3,
      targetSchemaVersion: 3,
      integrity: "ok",
      recoveryCode: null,
      recoveryBackupPath: null,
      nextStep: null
    };

    const diagnostics = {
      appVersion: "0.2.0-beta.1",
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
        state: "available",
        kind: "portable_project",
        createdAt: "2026-07-26T00:00:00.000Z",
        formatVersion: 2,
        schemaVersion: null
      },
      relinkAvailable: true,
      supportReport: {
        diagnosticFormatVersion: 1,
        appVersion: "0.2.0-beta.1",
        folderState: "available",
        git: { configured: false, repositoryDetected: false },
        database: {
          state: "ready",
          schemaVersion: 3,
          targetSchemaVersion: 3,
          integrity: "ok"
        },
        lastBackup: {
          state: "available",
          kind: "portable_project",
          createdAt: "2026-07-26T00:00:00.000Z",
          formatVersion: 2,
          schemaVersion: null
        },
        relinkAvailable: true
      }
    };

    (window as BetaSmokeWindow).__BETA_SMOKE_CALLS__ = calls;
    window.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        calls.push({ command, args });

        if (command === "plugin:dialog|open") {
          dialogCall += 1;
          return dialogCall === 1
            ? "/tmp/beta-backup-destination"
            : dialogCall === 2
              ? "/tmp/beta-backup.desclop"
              : "/tmp/beta-restored-project";
        }
        if (command === "get_database_status") {
          return databaseStatus;
        }
        if (command === "list_projects") {
          return restored ? [restoredProject, project] : [project];
        }
        if (command === "list_project_summaries") {
          return [];
        }
        if (command === "get_resume_brief") {
          return {
            id: `resume-${args.projectId}`,
            projectId: args.projectId,
            taskId: "task-1",
            stageId: "stage-1",
            latestNote: "",
            nextStep: "Run the platform checklist",
            facts: [],
            generatedAt: "2026-07-26T00:00:00.000Z"
          };
        }
        if (command === "load_project_plan") {
          return plan;
        }
        if (command === "get_project_diagnostics") {
          return diagnostics;
        }
        if (command === "export_project_bundle") {
          return {
            path: "/tmp/beta-backup.desclop",
            exportedAt: "2026-07-26T00:00:00.000Z",
            formatVersion: 2,
            backupRecorded: true
          };
        }
        if (command === "inspect_project_bundle") {
          return {
            formatVersion: 2,
            compatibility: "current",
            projectName: "Beta smoke project",
            planCount: 1,
            stageCount: 1,
            taskCount: 1,
            checklistItemCount: 0,
            noteCount: 0,
            workEntryCount: 0
          };
        }
        if (command === "import_project_bundle") {
          restored = true;
          return "project-2";
        }

        return null;
      }
    };
  });

  await page.goto("/");
  await page.getByRole("dialog", { name: "First-run help" }).getByRole("button", { name: "Got it" }).click();

  await page.getByRole("button", { name: "Backups", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Export / Import" })).toBeVisible();
  await expect(page.locator("strong").filter({ hasText: "Beta smoke project" })).toBeVisible();

  const supportReport = page.getByLabel("Technical support report");
  await page.getByText("For support").click();
  await expect(supportReport).toHaveValue(/0\.2\.0-beta\.1/);
  await expect(supportReport).not.toHaveValue(/beta-private|Beta smoke project/);

  await page.getByRole("button", { name: "Choose destination folder" }).click();
  await page.getByRole("button", { name: "Export portable backup" }).click();
  await expect(page.getByText("A portable .desclop backup and matching README were created.")).toBeVisible();

  await page.getByRole("button", { name: "Choose backup file" }).click();
  await page.getByRole("button", { name: "Choose local project folder" }).click();
  await page.getByRole("button", { name: "Review portable restore" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm portable backup restore" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.locator("strong").filter({ hasText: "Restored beta smoke project" })).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("When the window is closed").selectOption("quit");

  const calls = await page.evaluate(() => (window as BetaSmokeWindow).__BETA_SMOKE_CALLS__);
  expect(calls.some(({ command }) => command === "export_project_bundle")).toBe(true);
  expect(calls.some(({ command }) => command === "inspect_project_bundle")).toBe(true);
  expect(calls.some(({ command }) => command === "import_project_bundle")).toBe(true);
  expect(calls.some(({ command, args }) => command === "set_close_behavior" && args.behavior === "quit")).toBe(true);
});
