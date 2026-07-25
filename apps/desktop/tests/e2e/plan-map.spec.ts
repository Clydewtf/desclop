import { expect, test } from "@playwright/test";

test("Plan map keeps one current plan and restores a hidden completed plan", async ({ page }) => {
  await page.addInitScript(() => {
    type Plan = {
      id: string;
      projectId: string;
      title: string;
      position: number;
    };
    type Stage = {
      id: string;
      projectId: string;
      planId: string;
      title: string;
      description: string;
      position: number;
      status: "future" | "current" | "completed";
    };
    type Task = {
      id: string;
      projectId: string;
      stageId: string;
      title: string;
      description: string;
      status: "todo" | "active" | "blocked" | "done";
      priority: "low" | "normal" | "high" | null;
      dueDate: string | null;
      nextStep: string;
      position: number;
    };

    const project = {
      id: "project-1",
      name: "Plan map fixture",
      localPath: "/tmp/desclop-plan-map",
      gitEnabled: false,
      gitRemote: null,
      activeTaskId: null as string | null,
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:00:00.000Z"
    };
    const plans: Plan[] = [];
    const stages: Stage[] = [];
    const tasks: Task[] = [];
    let sequence = 0;
    const nextId = (prefix: string) => `${prefix}-${++sequence}`;
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

    function recalculateStages() {
      plans.forEach((plan) => {
        const planStages = stages
          .filter((stage) => stage.planId === plan.id)
          .sort((left, right) => left.position - right.position);
        let currentAssigned = false;
        planStages.forEach((stage) => {
          const stageTasks = tasks.filter((task) => task.stageId === stage.id);
          if (stageTasks.length > 0 && stageTasks.every((task) => task.status === "done")) {
            stage.status = "completed";
          } else if (!currentAssigned) {
            stage.status = "current";
            currentAssigned = true;
          } else {
            stage.status = "future";
          }
        });
      });
    }

    function resumeBrief() {
      const task =
        tasks.find((candidate) => candidate.id === project.activeTaskId) ??
        tasks.find((candidate) => candidate.status !== "done") ??
        null;
      return {
        id: "resume-1",
        projectId: project.id,
        taskId: task?.id ?? null,
        stageId: task?.stageId ?? null,
        latestNote: "",
        nextStep: task?.nextStep ?? "",
        facts: [],
        generatedAt: "2026-07-25T10:00:00.000Z"
      };
    }

    window.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: Record<string, any> = {}) => {
        switch (command) {
          case "get_database_status":
            return {
              state: "ready",
              schemaVersion: 3,
              targetSchemaVersion: 3,
              integrity: "ok",
              recoveryCode: null,
              recoveryBackupPath: null,
              nextStep: null
            };
          case "list_projects":
            return [clone(project)];
          case "list_project_summaries":
            return [];
          case "get_resume_brief":
            return resumeBrief();
          case "inspect_project_folder":
            return { gitRepository: false };
          case "create_project":
            return clone(project);
          case "load_project_plan":
            return {
              plans: clone(plans),
              stages: clone(stages),
              tasks: clone(tasks),
              checklistItems: []
            };
          case "import_plan": {
            const planId = `plan-${plans.length + 1}`;
            const plan: Plan = {
              id: planId,
              projectId: args.projectId,
              title: args.title,
              position: plans.length
            };
            plans.push(plan);
            args.stages.forEach((stage: any, stageIndex: number) => {
              const stageId = nextId("stage");
              stages.push({
                id: stageId,
                projectId: args.projectId,
                planId,
                title: stage.title,
                description: stage.description,
                position: stage.position,
                status: "future"
              });
              stage.tasks.forEach((task: any) => {
                tasks.push({
                  id: nextId("task"),
                  projectId: args.projectId,
                  stageId,
                  title: task.title,
                  description: task.description,
                  status: task.status === "done" ? "done" : "todo",
                  priority: null,
                  dueDate: null,
                  nextStep: "",
                  position: task.position
                });
              });
              if (stageIndex === 0) {
                recalculateStages();
              }
            });
            recalculateStages();
            return null;
          }
          case "set_active_task":
            project.activeTaskId = args.taskId;
            tasks.forEach((task) => {
              if (task.projectId === args.projectId && task.status === "active") {
                task.status = "todo";
              }
              if (task.id === args.taskId) {
                task.status = "active";
              }
            });
            recalculateStages();
            return null;
          case "update_task_status":
            tasks.forEach((task) => {
              if (task.id === args.taskId) {
                task.status = args.status;
              }
            });
            if (args.status === "done" && project.activeTaskId === args.taskId) {
              project.activeTaskId = null;
            }
            recalculateStages();
            return null;
          case "list_notes_for_task":
          case "list_work_entries_for_task":
          case "list_linked_commits_for_task":
          case "list_inbox_items_for_task":
          case "list_inbox_items_for_project":
          case "sync_git_commits":
            return [];
          default:
            return null;
        }
      }
    };
  });

  await page.goto("/");
  await page.getByRole("dialog", { name: "First-run help" }).getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Import Plan", exact: true }).click();
  await page.getByLabel("Markdown plan").fill("# Baseline Plan\n\n## Foundation\n- [ ] Keep baseline data");
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("button", { name: "Import 1 task", exact: true }).click();

  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  const importNavigationButton = primaryNavigation.getByRole("button", { name: "Import Plan" });
  await importNavigationButton.click();
  await page.getByLabel("Markdown plan").fill("# Fix Plan\n\n## Delivery\n- [ ] Fix release");
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("button", { name: "Import 1 task", exact: true }).click();

  const baselineFrame = page.getByRole("article").filter({ hasText: "Baseline Plan" });
  expect(await baselineFrame.count()).toBe(1);
  await expect(baselineFrame.getByText("Current working plan")).toBeVisible();
  const chooseFixPlan = page.getByRole("button", { name: "Continue plan Fix Plan" });
  expect(await chooseFixPlan.count()).toBe(1);
  await chooseFixPlan.click();

  await expect(page.getByRole("heading", { name: "Fix release" })).toBeVisible();
  await page.getByLabel("Task status").selectOption("done");
  await page.getByRole("button", { name: "Plan", exact: true }).click();

  const hideFixPlan = page.getByRole("button", { name: "Hide completed plan Fix Plan" });
  expect(await hideFixPlan.count()).toBe(1);
  await hideFixPlan.click();
  await expect(page.getByRole("heading", { name: "Hidden completed plans" })).toBeVisible();
  await expect(page.getByText("Keep baseline data")).toBeVisible();

  const archivedState = await page.evaluate(() => localStorage.getItem("desclop.planner-archive"));
  expect(archivedState).toContain("plan-2");

  await page.getByRole("button", { name: "Restore plan Fix Plan" }).click();
  const restoredState = await page.evaluate(() => localStorage.getItem("desclop.planner-archive"));
  expect(restoredState ?? "").not.toContain("plan-2");
  await page.getByRole("button", { name: "Show plan Fix Plan" }).click();
  await page.getByRole("button", { name: "Expand stage Delivery" }).click();
  await expect(page.getByText("Fix release")).toBeVisible();
});
