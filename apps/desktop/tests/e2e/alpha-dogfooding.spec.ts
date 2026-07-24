import { expect, test } from "@playwright/test";

test("alpha dogfooding flow is navigable", async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      projects: [],
      stages: [],
      tasks: [],
      checklistItems: [],
      notes: [],
      workEntries: [],
      inboxItems: []
    };

    function now() {
      return "2026-05-20T10:00:00.000Z";
    }

    function resumeBrief(projectId) {
      const project = state.projects.find((candidate) => candidate.id === projectId);
      const task =
        state.tasks.find((candidate) => candidate.id === project?.activeTaskId) ??
        state.tasks.find((candidate) => candidate.projectId === projectId && candidate.status !== "done") ??
        null;
      const stage = state.stages.find((candidate) => candidate.id === task?.stageId) ?? null;
      const latestNote =
        [...state.notes].reverse().find((candidate) => candidate.projectId === projectId)?.body ?? "";
      const workEntryCount = state.workEntries.filter((entry) => entry.projectId === projectId).length;
      const openInboxCount = state.inboxItems.filter(
        (item) => item.projectId === projectId && item.status === "open"
      ).length;
      const facts = [
        workEntryCount > 0 ? `${workEntryCount} recent work entries` : "",
        openInboxCount > 0 ? `${openInboxCount} open inbox captures` : ""
      ].filter(Boolean);

      return {
        id: "rb1",
        projectId,
        taskId: task?.id ?? null,
        stageId: task?.stageId ?? stage?.id ?? null,
        latestNote,
        nextStep: task?.nextStep || "Choose the next concrete step before you stop.",
        facts,
        generatedAt: now()
      };
    }

    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "plugin:dialog|open") {
          return "/tmp/desclop-alpha-e2e";
        }

        if (cmd === "list_projects") {
          return state.projects;
        }

        if (cmd === "inspect_project_folder") {
          return { gitRepository: false };
        }

        if (cmd === "create_project") {
          const project = {
            id: "p1",
            name: args.input.name,
            localPath: args.input.localPath,
            gitEnabled: args.input.gitEnabled,
            gitRemote: null,
            activeTaskId: null,
            createdAt: now(),
            updatedAt: now()
          };
          state.projects = [project];
          return project;
        }

        if (cmd === "get_resume_brief") {
          return resumeBrief(args.projectId);
        }

        if (cmd === "sync_git_commits" || cmd === "list_linked_commits_for_task") {
          return [];
        }

        if (cmd === "load_project_plan") {
          return {
            stages: state.stages.filter((stage) => stage.projectId === args.projectId),
            tasks: state.tasks.filter((task) => task.projectId === args.projectId),
            checklistItems: state.checklistItems.filter((item) =>
              state.tasks.some((task) => task.projectId === args.projectId && task.id === item.taskId)
            )
          };
        }

        if (cmd === "import_plan") {
          state.stages = args.stages.map((stage, stageIndex) => ({
            id: `s${stageIndex + 1}`,
            projectId: args.projectId,
            title: stage.title,
            description: stage.description,
            position: stage.position,
            status: stageIndex === 0 ? "current" : "future"
          }));
          state.tasks = args.stages.flatMap((stage, stageIndex) =>
            stage.tasks.map((task, taskIndex) => ({
              id: `t${stageIndex + 1}-${taskIndex + 1}`,
              projectId: args.projectId,
              stageId: `s${stageIndex + 1}`,
              title: task.title,
              description: "",
              status: task.status,
              priority: null,
              dueDate: null,
              nextStep: "",
              position: task.position
            }))
          );
          state.checklistItems = args.stages.flatMap((stage, stageIndex) =>
            stage.tasks.flatMap((task, taskIndex) =>
              task.checklist.map((item, itemIndex) => ({
                id: `c${stageIndex + 1}-${taskIndex + 1}-${itemIndex + 1}`,
                taskId: `t${stageIndex + 1}-${taskIndex + 1}`,
                title: item.title,
                completed: item.completed,
                position: item.position
              }))
            )
          );
          return undefined;
        }

        if (cmd === "set_active_task") {
          const project = state.projects.find((candidate) => candidate.id === args.projectId);
          if (project) {
            project.activeTaskId = args.taskId;
          }
          state.tasks = state.tasks.map((task) =>
            task.projectId === args.projectId
              ? { ...task, status: task.id === args.taskId ? "active" : task.status === "active" ? "todo" : task.status }
              : task
          );
          return undefined;
        }

        if (cmd === "update_next_step") {
          state.tasks = state.tasks.map((task) =>
            task.id === args.taskId ? { ...task, nextStep: args.nextStep } : task
          );
          return undefined;
        }

        if (cmd === "list_notes_for_task") {
          return state.notes.filter((note) => note.projectId === args.projectId && note.taskId === args.taskId);
        }

        if (cmd === "list_work_entries_for_task") {
          return state.workEntries.filter(
            (entry) => entry.projectId === args.projectId && entry.taskId === args.taskId
          );
        }

        if (cmd === "capture_inbox_item") {
          const item = {
            id: `i${state.inboxItems.length + 1}`,
            projectId: args.input.projectId,
            taskId: null,
            body: args.input.body,
            kind: args.input.kind,
            status: "open",
            createdAt: now(),
            updatedAt: now()
          };
          state.inboxItems.push(item);
          return item;
        }

        if (cmd === "create_work_entry") {
          const entry = {
            id: `w${state.workEntries.length + 1}`,
            projectId: args.input.projectId,
            taskId: args.input.taskId,
            source: args.input.source,
            startedAt: args.input.startedAt,
            endedAt: args.input.endedAt,
            durationSeconds: args.input.durationSeconds,
            done: args.input.done,
            remains: args.input.remains,
            nextStep: args.input.nextStep,
            createdAt: now()
          };
          state.workEntries.push(entry);
          if (entry.taskId && entry.nextStep) {
            state.tasks = state.tasks.map((task) =>
              task.id === entry.taskId ? { ...task, nextStep: entry.nextStep } : task
            );
          }
          return entry;
        }

        throw new Error(`Unhandled invoke: ${cmd}`);
      },
      transformCallback: () => 1,
      unregisterCallback: () => undefined,
      runCallback: () => undefined,
      callbacks: new Map(),
      convertFileSrc: (filePath) => filePath
    };
  });

  await page.goto("/");

  const firstRunHelp = page.getByRole("dialog", { name: "First-run help" });
  await expect(firstRunHelp).toBeVisible();
  await firstRunHelp.getByRole("button", { name: "Got it" }).click();
  await expect(firstRunHelp).toBeHidden();

  await expect(page.getByRole("heading", { name: "Create a local project" })).toBeVisible();
  await page.getByLabel("Project name").fill("Desclop");
  await page.getByRole("button", { name: "Choose folder" }).click();
  await expect(page.getByLabel("Local folder path")).toHaveValue("/tmp/desclop-alpha-e2e");
  await expect(page.getByText("Folder path: /tmp/desclop-alpha-e2e")).toBeVisible();
  await page.getByRole("button", { name: "Create project" }).click();

  await page.getByRole("button", { name: "Import a plan" }).click();
  await page
    .getByLabel("Markdown plan")
    .fill("## Alpha UX\n- [ ] Restructure Today\n  - [ ] Add current task card");
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.locator(".markdown-preview__action").click();

  await expect(page.getByRole("heading", { name: "Alpha UX" })).toBeVisible();
  await page.getByRole("button", { name: "Continue Restructure Today" }).click();
  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();

  await page.getByLabel("Next action").fill("Run visual QA");
  await page.getByRole("button", { name: "Save next action" }).click();
  await page.getByRole("button", { name: "Capture" }).click();
  const quickCaptureDialog = page.getByRole("dialog", { name: "Quick capture" });
  await expect(quickCaptureDialog).toBeVisible();
  await quickCaptureDialog.getByLabel("Related to").selectOption("__inbox__");
  const captureInput = quickCaptureDialog.getByRole("textbox", { name: "Capture" });
  await captureInput.fill("Check narrow desktop layout");
  await quickCaptureDialog.getByRole("combobox", { name: "Type" }).selectOption("question");
  await quickCaptureDialog.getByRole("button", { name: "Save capture" }).click();
  await expect(page.getByText("Check narrow desktop layout")).toBeVisible();

  await page.getByRole("button", { name: "Add work review" }).click();
  await page.getByLabel("What changed?").fill("Reviewed alpha flow");
  await page.getByLabel("What remains?").fill("Run browser screenshots");
  await page.getByLabel("Next action").fill("Capture final screenshots");
  await page.getByRole("button", { name: "Save review" }).click();
  await page.getByRole("button", { name: "Today" }).click();

  const currentTask = page.getByLabel("Current task");
  await expect(currentTask.getByRole("heading", { name: "Restructure Today" })).toBeVisible();
  await expect(currentTask.getByText("Capture final screenshots")).toBeVisible();
  await expect(page.getByText("1 open inbox captures")).toBeVisible();
  await expect(page.getByText("1 recent work entries")).toBeVisible();
});
