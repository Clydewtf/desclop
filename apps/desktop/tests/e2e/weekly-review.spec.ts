import { expect, test } from "@playwright/test";

test("Weekly Review explains local counts and returns to linked context", async ({ page }) => {
  await page.addInitScript(() => {
    const project = {
      id: "project-1",
      name: "Review project",
      localPath: "/tmp/review-project",
      gitEnabled: false,
      gitRemote: null,
      activeTaskId: "active-task",
      createdAt: "2026-06-16T08:00:00.000Z",
      updatedAt: "2026-06-16T08:00:00.000Z"
    };
    const stages = [
      {
        id: "stage-1",
        projectId: project.id,
        planId: "plan-1",
        title: "Current stage",
        description: "",
        position: 0,
        status: "current"
      }
    ];
    const tasks = [
      {
        id: "completed-task",
        projectId: project.id,
        stageId: "stage-1",
        title: "Completed task",
        description: "",
        status: "done",
        priority: null,
        dueDate: null,
        nextStep: "",
        position: 0,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      },
      {
        id: "active-task",
        projectId: project.id,
        stageId: "stage-1",
        title: "Active task",
        description: "",
        status: "active",
        priority: null,
        dueDate: null,
        nextStep: "Run the focused checks",
        position: 1,
        updatedAt: new Date().toISOString()
      }
    ];
    const workEntries = [
      {
        id: "work-1",
        projectId: project.id,
        taskId: "active-task",
        source: "manual",
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        done: "Reviewed the local workflow",
        remains: "",
        nextStep: "Run the focused checks",
        createdAt: new Date().toISOString()
      }
    ];
    const inboxItems = [
      {
        id: "capture-1",
        projectId: project.id,
        taskId: null,
        body: "Capture to revisit",
        kind: "note",
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    const notes = [
      {
        id: "note-1",
        projectId: project.id,
        taskId: "active-task",
        body: "A note for the timeline",
        createdAt: new Date().toISOString()
      }
    ];

    window.__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        switch (command) {
          case "list_projects":
            return [project];
          case "list_project_summaries":
            return [{ projectId: project.id, taskCount: tasks.length, openInboxCount: 1, activeTaskTitle: "Active task" }];
          case "get_resume_brief":
            return {
              id: "resume-1",
              projectId: project.id,
              taskId: "active-task",
              stageId: "stage-1",
              latestNote: "A note for the timeline",
              nextStep: "Run the focused checks",
              facts: [],
              generatedAt: new Date().toISOString()
            };
          case "load_project_plan":
            return {
              plans: [{ id: "plan-1", projectId: project.id, title: "Review plan", position: 0 }],
              stages,
              tasks,
              checklistItems: []
            };
          case "list_notes_for_project":
            return notes;
          case "list_notes_for_task":
            return notes.filter((note) => note.taskId === "active-task");
          case "list_work_entries_for_project":
          case "list_work_entries_for_task":
            return workEntries;
          case "list_inbox_items_for_project":
          case "list_inbox_items_for_task":
            return inboxItems;
          default:
            return [];
        }
      }
    };
  });

  await page.goto("/");
  const firstRunHelp = page.getByRole("dialog", { name: "First-run help" });
  await expect(firstRunHelp).toBeVisible();
  await firstRunHelp.getByRole("button", { name: "Got it" }).click();

  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  const reviewNav = primaryNav.getByRole("button", { name: "Review" });
  await expect(reviewNav).toHaveCount(1);
  await reviewNav.click();
  await expect(page.getByRole("heading", { name: "Weekly Review" })).toBeVisible();

  await expect(page.getByLabel("Completed tasks value")).toHaveText("1");
  await expect(page.getByLabel("Open captures value")).toHaveText("1");
  await expect(page.getByLabel("Tasks without next action value")).toHaveText("0");
  await expect(page.getByLabel("Work reviews value")).toHaveText("1");

  const heatmap = page.getByRole("article", { name: "Activity heatmap" });
  await expect(heatmap.getByText("1/7 active days")).toBeVisible();
  await heatmap.getByRole("button", { name: /4 activities/ }).click();
  await expect(heatmap.getByText("Reviewed the local workflow")).toBeVisible();

  const completedCard = page.getByRole("article", { name: "Completed tasks" });
  const completedDetails = completedCard.locator("details");
  await expect(completedDetails).toHaveCount(1);
  await completedDetails.locator("summary").click();
  const completedOpenTask = completedCard.getByRole("button", { name: "Open task" });
  await expect(completedOpenTask).toHaveCount(1);
  await completedOpenTask.click();
  await expect(page.getByRole("heading", { name: "Completed task" })).toBeVisible();

  const reviewAgain = primaryNav.getByRole("button", { name: "Review" });
  await expect(reviewAgain).toHaveCount(1);
  await reviewAgain.click();
  await expect(page.getByRole("heading", { name: "Weekly Review" })).toBeVisible();

  const captureCard = page.getByRole("article", { name: "Open captures" });
  await captureCard.locator("details").locator("summary").click();
  const openTimeline = captureCard.getByRole("button", { name: "Open Timeline" });
  await expect(openTimeline).toHaveCount(1);
  await openTimeline.click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("A note for the timeline")).toBeVisible();
});
