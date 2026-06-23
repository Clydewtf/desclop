import { expect, test } from "@playwright/test";

test("resume-first MVP flow works without Git or Focus Mode", async ({ page }) => {
  await page.addInitScript(() => {
    type Project = {
      id: string;
      name: string;
      localPath: string;
      gitEnabled: boolean;
      gitRemote: string | null;
      activeTaskId: string | null;
      createdAt: string;
      updatedAt: string;
    };
    type Stage = {
      id: string;
      projectId: string;
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
    type ChecklistItem = {
      id: string;
      taskId: string;
      title: string;
      completed: boolean;
      position: number;
    };
    type Note = {
      id: string;
      projectId: string;
      taskId: string | null;
      body: string;
      createdAt: string;
    };

    let project: Project | null = null;
    let stages: Stage[] = [];
    let tasks: Task[] = [];
    let checklistItems: ChecklistItem[] = [];
    let notes: Note[] = [];
    let sequence = 0;

    const now = () => new Date("2026-06-04T00:00:00.000Z").toISOString();
    const nextId = (prefix: string) => `${prefix}-${++sequence}`;
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

    function buildResumeBrief(projectId: string) {
      const activeTask =
        tasks.find((task) => task.id === project?.activeTaskId) ??
        tasks.find((task) => task.status === "active") ??
        tasks.find((task) => task.status !== "done") ??
        null;
      const latestNote = activeTask
        ? notes.filter((note) => note.taskId === activeTask.id).at(-1)?.body ?? ""
        : "";

      return {
        id: "resume-1",
        projectId,
        taskId: activeTask?.id ?? null,
        stageId: activeTask?.stageId ?? null,
        latestNote,
        nextStep: activeTask?.nextStep ?? "",
        facts: latestNote ? [`Latest note: ${latestNote}`] : [],
        generatedAt: now()
      };
    }

    window.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args?: Record<string, any>) => {
        switch (command) {
          case "list_projects":
            return project ? [clone(project)] : [];
          case "create_project": {
            const input = args?.input;
            project = {
              id: "project-1",
              name: input.name,
              localPath: input.localPath,
              gitEnabled: input.gitEnabled,
              gitRemote: null,
              activeTaskId: null,
              createdAt: now(),
              updatedAt: now()
            };
            stages = [];
            tasks = [];
            checklistItems = [];
            notes = [];
            return clone(project);
          }
          case "load_project_plan":
            return {
              stages: clone(stages),
              tasks: clone(tasks),
              checklistItems: clone(checklistItems)
            };
          case "get_resume_brief":
            return buildResumeBrief(args?.projectId);
          case "import_plan": {
            const projectId = args?.projectId;
            stages = args?.stages.map((stage: any, stageIndex: number) => {
              const id = nextId("stage");
              return {
                id,
                projectId,
                title: stage.title,
                description: stage.description,
                position: stage.position,
                status: stageIndex === 0 ? "current" : "future"
              };
            });
            tasks = [];
            checklistItems = [];
            args?.stages.forEach((stage: any, stageIndex: number) => {
              stage.tasks.forEach((task: any) => {
                const taskId = nextId("task");
                tasks.push({
                  id: taskId,
                  projectId,
                  stageId: stages[stageIndex].id,
                  title: task.title,
                  description: "",
                  status: task.status === "done" ? "done" : "todo",
                  priority: null,
                  dueDate: null,
                  nextStep: "",
                  position: task.position
                });
                task.checklist.forEach((item: any) => {
                  checklistItems.push({
                    id: nextId("checklist"),
                    taskId,
                    title: item.title,
                    completed: item.completed,
                    position: item.position
                  });
                });
              });
            });
            return null;
          }
	          case "update_task_status": {
	            tasks = tasks.map((task) =>
	              task.id === args?.taskId ? { ...task, status: args.status } : task
	            );
	            if (project && args?.status === "active") {
	              project = { ...project, activeTaskId: args.taskId, updatedAt: now() };
	            }
	            return null;
	          }
	          case "set_active_task":
	            if (project) {
	              project = { ...project, activeTaskId: args?.taskId, updatedAt: now() };
	            }
	            tasks = tasks.map((task) =>
	              task.projectId === args?.projectId
	                ? {
	                    ...task,
	                    status:
	                      task.id === args?.taskId
	                        ? "active"
	                        : task.status === "active"
	                          ? "todo"
	                          : task.status
	                  }
	                : task
	            );
	            return null;
	          case "update_next_step":
	            tasks = tasks.map((task) =>
	              task.id === args?.taskId ? { ...task, nextStep: args.nextStep } : task
	            );
	            return null;
          case "add_note": {
            const note = {
              id: nextId("note"),
              projectId: args?.projectId,
              taskId: args?.taskId,
              body: args?.body,
              createdAt: now()
            };
            notes = [...notes, note];
            return clone(note);
          }
	          case "list_notes_for_task":
	            return clone(notes.filter((note) => note.taskId === args?.taskId));
	          case "list_notes_for_project":
	            return clone(notes.filter((note) => note.projectId === args?.projectId));
	          case "list_work_entries_for_task":
	          case "list_work_entries_for_project":
	          case "list_linked_commits_for_task":
	          case "list_inbox_items_for_project":
	          case "list_inbox_items_for_task":
	            return [];
	          default:
	            throw new Error(`Unhandled test invoke: ${command}`);
	        }
      }
    };
  });

  await page.goto("/");
  await page.getByLabel("Project name").fill("Desclop");
  await page.getByLabel("Local folder path").fill("/tmp/desclop-no-git");
  await page.getByRole("button", { name: "Create project" }).click();

	  await page.getByRole("button", { name: /Import (a )?plan/i }).first().click();
  await page.getByLabel("Markdown plan").fill([
    "## Foundation",
    "- [ ] Create local store",
    "  - [ ] Add migration",
    "## Resume Flow",
    "- [ ] Show Today"
  ].join("\n"));
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("heading", { name: "Foundation" })).toBeVisible();
  await page.getByRole("button", { name: "Import plan", exact: true }).click();

  await page.getByRole("button", { name: "Continue Create local store" }).click();
  await page.getByLabel("Task status").selectOption("active");
  await page.getByLabel("Next action").fill("Run migration tests");
  await page.getByRole("button", { name: "Save next action" }).click();
  await page.getByLabel("Quick note").fill("Migration schema drafted");
  await page.getByRole("button", { name: "Add note" }).click();

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("Continue where you left off")).toBeVisible();
  await expect(page.getByText("Create local store")).toBeVisible();
  await expect(page.getByText("Run migration tests")).toBeVisible();
});
